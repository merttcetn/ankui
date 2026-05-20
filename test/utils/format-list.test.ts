import assert from "node:assert/strict";
import test from "node:test";

import { formatList, type ListFilters } from "../../src/utils/format-list.js";
import { createScanSummary, createAllEmptyTools, type ScanResult } from "../../src/types.js";

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

const NO_FILTERS: ListFilters = {};

test("formatList returns 'no skills configured.' for empty input with no filters", () => {
  const output = formatList(emptyResult(), NO_FILTERS);
  assert.match(output, /^Ankui — no skills configured\.\s*$/);
});

test("formatList reports filter context when filtered result is empty", () => {
  const output = formatList(emptyResult(), { kind: "mcp_server" });
  assert.match(output, /no skills match.*kind=mcp_server/);
});

test("formatList reports both filters when both empty", () => {
  const output = formatList(emptyResult(), { kind: "mcp_server", tool: "claude" });
  assert.match(output, /no skills match.*kind=mcp_server.*tool=claude/);
});

import { createSkillId, type AITool, type Skill } from "../../src/types.js";

function makeSkill(input: {
  toolId: AITool["id"];
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

function withSkill(result: ScanResult, toolId: AITool["id"], skill: Skill): ScanResult {
  return {
    ...result,
    tools: result.tools.map((t) => (t.id === toolId ? { ...t, skills: [...t.skills, skill] } : t))
  };
}

test("formatList groups skills by tool with section headers", () => {
  let result = emptyResult();
  result = { ...result, homeDir: "/Users/x" };
  result = withSkill(result, "claude", makeSkill({ toolId: "claude", kind: "agent_skill", name: "deploy", sourcePath: "/Users/x/.claude/skills/deploy/SKILL.md" }));
  result = withSkill(result, "claude", makeSkill({ toolId: "claude", kind: "plugins",     name: "rev",    sourcePath: "/Users/x/.claude/plugins/rev/plugin.json" }));
  result = withSkill(result, "codex",  makeSkill({ toolId: "codex",  kind: "agent_skill", name: "test",   sourcePath: "/Users/x/.codex/skills/test/SKILL.md" }));

  const output = formatList(result, {});

  assert.match(output.split("\n")[0], /^Ankui — 3 skills$/);
  assert.match(output, /claude \(2\)\n──────────\n/);
  assert.match(output, /codex \(1\)\n─────────\n/);
  assert.match(output, /agent_skill\s+deploy\s+~\/\.claude\/skills\/deploy\/SKILL\.md/);
  assert.match(output, /plugins\s+rev/);
});

test("formatList orders tools in canonical order (claude, codex, cursor, ...)", () => {
  let result = emptyResult();
  result = withSkill(result, "gemini", makeSkill({ toolId: "gemini", kind: "agent_skill", name: "a" }));
  result = withSkill(result, "claude", makeSkill({ toolId: "claude", kind: "agent_skill", name: "b" }));
  result = withSkill(result, "codex",  makeSkill({ toolId: "codex",  kind: "agent_skill", name: "c" }));

  const output = formatList(result, {});
  const claudeIdx = output.indexOf("claude");
  const codexIdx = output.indexOf("codex");
  const geminiIdx = output.indexOf("gemini");
  assert.ok(claudeIdx > 0 && claudeIdx < codexIdx, "claude before codex");
  assert.ok(codexIdx < geminiIdx, "codex before gemini");
});

test("formatList adds capability tag for mcp_server entries", () => {
  let result = emptyResult();
  result = withSkill(result, "cursor", makeSkill({
    toolId: "cursor",
    kind: "mcp_server",
    name: "shadcn",
    capabilityCategories: ["network"],
    accessLevel: "limited"
  }));

  const output = formatList(result, {});
  assert.match(output, /shadcn.*network · limited/);
});

test("formatList omits capability tag for unclassified entries", () => {
  let result = emptyResult();
  result = withSkill(result, "claude", makeSkill({ toolId: "claude", kind: "agent_skill", name: "do" }));

  const output = formatList(result, {});
  assert.doesNotMatch(output, /unknown · unknown/);
});

import { formatListJson } from "../../src/utils/format-list.js";

test("formatListJson returns dense byTool with all tool keys present", () => {
  let result = emptyResult();
  result = { ...result, scannedAt: "2026-05-13T12:00:00.000Z", cwd: "/p", homeDir: "/h" };
  result = withSkill(result, "claude", makeSkill({ toolId: "claude", kind: "agent_skill", name: "a" }));
  result = withSkill(result, "codex",  makeSkill({ toolId: "codex",  kind: "agent_skill", name: "b" }));

  const json = JSON.parse(formatListJson(result, {}));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.cwd, "/p");
  assert.equal(json.homeDir, "/h");
  assert.deepEqual(json.filters, { kind: null, tool: null });
  assert.equal(json.totalSkills, 2);

  for (const toolId of ["claude", "codex", "cursor", "gemini", "opencode", "antigravity", "skills-sh"]) {
    assert.ok(toolId in json.byTool, `expected key ${toolId}`);
  }
  assert.equal(json.byTool.claude.length, 1);
  assert.equal(json.byTool.codex.length, 1);
  assert.equal(json.byTool.cursor.length, 0);
});

test("formatListJson echoes filters in payload", () => {
  const json = JSON.parse(formatListJson(emptyResult(), { kind: "mcp_server", tool: "claude" }));
  assert.deepEqual(json.filters, { kind: "mcp_server", tool: "claude" });
});
