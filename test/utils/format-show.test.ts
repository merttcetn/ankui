import assert from "node:assert/strict";
import test from "node:test";

import { formatShow, formatShowJson, ToolNotFoundError } from "../../src/utils/format-show.js";
import { createScanSummary, createAllEmptyTools, createSkillId, type ScanResult, type Skill, type ToolId } from "../../src/types.js";

function emptyResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd: "/tmp/cwd",
    homeDir: "/tmp/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function makeSkill(input: {
  toolId: ToolId;
  kind: Skill["kind"];
  name: string;
  sourcePath?: string;
  capabilityCategories?: Skill["capabilityCategories"];
  accessLevel?: Skill["accessLevel"];
}): Skill {
  const sourcePath = input.sourcePath ?? `/tmp/${input.name}`;
  return {
    id: createSkillId({ toolId: input.toolId, kind: input.kind, name: input.name, sourcePath }),
    toolId: input.toolId,
    kind: input.kind,
    name: input.name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "directory",
    capabilityCategories: input.capabilityCategories ?? ["unknown"],
    accessLevel: input.accessLevel ?? "unknown"
  };
}

function withDetectedTool(result: ScanResult, toolId: ToolId, detectedPaths: string[]): ScanResult {
  return {
    ...result,
    tools: result.tools.map((t) =>
      t.id === toolId ? { ...t, detected: true, detectedPaths } : t
    )
  };
}

function withSkill(result: ScanResult, skill: Skill): ScanResult {
  return {
    ...result,
    tools: result.tools.map((t) =>
      t.id === skill.toolId ? { ...t, skills: [...t.skills, skill] } : t
    )
  };
}

test("formatShow throws ToolNotFoundError on unknown tool id", () => {
  assert.throws(
    () => formatShow(emptyResult(), "foo"),
    (err: unknown) => err instanceof ToolNotFoundError && /foo/.test((err as Error).message)
  );
});

test("formatShow prints 'Not detected' for a known but undetected tool", () => {
  const output = formatShow(emptyResult(), "claude");
  assert.match(output, /^Ankui — claude/);
  assert.match(output, /Not detected on this machine\./);
});

test("formatShow groups detected paths into user and project blocks", () => {
  let result = emptyResult();
  result = { ...result, cwd: "/Users/x/proj", homeDir: "/Users/x" };
  result = withDetectedTool(result, "claude", [
    "/Users/x/.claude",
    "/Users/x/.claude.json",
    "/Users/x/proj/.claude",
    "/Users/x/proj/.claude/settings.local.json"
  ]);

  const output = formatShow(result, "claude");

  assert.match(
    output,
    /Detected at:\n  user:\n    ~\/\.claude\n    ~\/\.claude\.json\n  project:\n    \.\/\.claude\n    \.\/\.claude\/settings\.local\.json/
  );
});

test("formatShow omits the project block when only user paths exist", () => {
  let result = emptyResult();
  result = { ...result, cwd: "/Users/x/proj", homeDir: "/Users/x" };
  result = withDetectedTool(result, "codex", ["/Users/x/.codex"]);

  const output = formatShow(result, "codex");

  assert.match(output, /Detected at:\n  user:\n    ~\/\.codex/);
  assert.doesNotMatch(output, /project:/);
});

test("formatShow renders 'No skills configured' when tool detected but has zero skills", () => {
  let result = emptyResult();
  result = withDetectedTool(result, "opencode", ["/h/.config/opencode"]);
  const output = formatShow(result, "opencode");
  assert.match(output, /No skills configured for this tool\./);
});

test("formatShow groups skills by kind in the canonical order", () => {
  let result = emptyResult();
  result = { ...result, homeDir: "/Users/x" };
  result = withDetectedTool(result, "claude", ["/Users/x/.claude"]);
  result = withSkill(result, makeSkill({ toolId: "claude", kind: "memory_file", name: "CLAUDE.md", sourcePath: "/Users/x/CLAUDE.md" }));
  result = withSkill(result, makeSkill({ toolId: "claude", kind: "plugins",     name: "review",   sourcePath: "/Users/x/.claude/plugins/review/plugin.json" }));
  result = withSkill(result, makeSkill({ toolId: "claude", kind: "mcp_server",  name: "Postgres", sourcePath: "/Users/x/.mcp.json", capabilityCategories: ["database"], accessLevel: "broad" }));
  result = withSkill(result, makeSkill({ toolId: "claude", kind: "agent_skill", name: "deploy",   sourcePath: "/Users/x/.claude/skills/deploy/SKILL.md" }));

  const output = formatShow(result, "claude");

  const mcpIdx = output.indexOf("mcp_server (1)");
  const agentIdx = output.indexOf("agent_skill (1)");
  const pluginsIdx = output.indexOf("plugins (1)");
  const memoryIdx = output.indexOf("memory_file (1)");

  assert.ok(mcpIdx > 0 && agentIdx > mcpIdx, "mcp_server before agent_skill");
  assert.ok(agentIdx < pluginsIdx, "agent_skill before plugins");
  assert.ok(pluginsIdx < memoryIdx, "plugins before memory_file");
});

test("formatShow renders capability tag for mcp_server entries", () => {
  let result = emptyResult();
  result = withDetectedTool(result, "claude", ["/h/.claude"]);
  result = withSkill(result, makeSkill({
    toolId: "claude",
    kind: "mcp_server",
    name: "Postgres",
    capabilityCategories: ["database"],
    accessLevel: "broad"
  }));

  const output = formatShow(result, "claude");
  assert.match(output, /Postgres.*database · broad/);
});

test("formatShow uses canonical row layout: name, optional tag, then relativized path", () => {
  let result = emptyResult();
  result = { ...result, homeDir: "/Users/x" };
  result = withDetectedTool(result, "claude", ["/Users/x/.claude"]);
  result = withSkill(result, makeSkill({
    toolId: "claude",
    kind: "agent_skill",
    name: "deploy",
    sourcePath: "/Users/x/.claude/skills/deploy/SKILL.md"
  }));

  const output = formatShow(result, "claude");
  assert.match(output, /agent_skill \(1\)\n───────────────\n  deploy\s+~\/\.claude\/skills\/deploy\/SKILL\.md/);
});

test("formatShowJson throws ToolNotFoundError on unknown tool id", () => {
  assert.throws(
    () => formatShowJson(emptyResult(), "nope"),
    (err: unknown) => err instanceof ToolNotFoundError
  );
});

test("formatShowJson returns dense skillsByKind with every kind key present", () => {
  let result = emptyResult();
  result = { ...result, scannedAt: "2026-05-13T12:00:00.000Z", cwd: "/p", homeDir: "/h" };
  result = withDetectedTool(result, "claude", ["/h/.claude"]);
  result = withSkill(result, makeSkill({ toolId: "claude", kind: "agent_skill", name: "x" }));

  const json = JSON.parse(formatShowJson(result, "claude"));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.tool, "claude");
  assert.equal(json.detected, true);
  assert.deepEqual(json.detectedPaths, ["/h/.claude"]);
  assert.ok(json.stats);
  for (const kind of [
    "mcp_server", "agent_skill", "skills_sh_skill", "custom_agents",
    "custom_commands", "custom_prompts", "custom_tools", "rules",
    "plugins", "memory_file"
  ]) {
    assert.ok(kind in json.skillsByKind, `expected key ${kind}`);
  }
  assert.equal(json.skillsByKind.agent_skill.length, 1);
  assert.equal(json.skillsByKind.mcp_server.length, 0);
});

test("formatShowJson reflects detected=false for undetected tools", () => {
  const json = JSON.parse(formatShowJson(emptyResult(), "claude"));
  assert.equal(json.detected, false);
  assert.deepEqual(json.detectedPaths, []);
});
