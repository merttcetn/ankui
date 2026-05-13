import assert from "node:assert/strict";
import test from "node:test";

import { formatMcpOverview } from "../../src/utils/format-mcp.js";
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

test("formatMcpOverview returns the empty-state message when no MCP servers are configured", () => {
  const output = formatMcpOverview(emptyResult());
  assert.match(output, /^Ankui MCP overview — no MCP servers configured\.\s*$/);
});

import { createSkillId, type AITool, type Skill } from "../../src/types.js";

function makeMcpSkill(input: {
  toolId: AITool["id"];
  name: string;
  scope?: Skill["scope"];
  capabilityCategories: Skill["capabilityCategories"];
  accessLevel: Skill["accessLevel"];
  sourcePath?: string;
  details?: Skill["details"];
}): Skill {
  const sourcePath = input.sourcePath ?? `/tmp/${input.name}.json`;
  return {
    id: createSkillId({ toolId: input.toolId, kind: "mcp_server", name: input.name, sourcePath }),
    toolId: input.toolId,
    kind: "mcp_server",
    name: input.name,
    summary: `${input.name} MCP server.`,
    scope: input.scope ?? "user",
    sourcePath,
    source: "config",
    capabilityCategories: input.capabilityCategories,
    accessLevel: input.accessLevel,
    details: input.details
  };
}

function withMcp(result: ScanResult, toolId: AITool["id"], skill: Skill): ScanResult {
  const next = {
    ...result,
    tools: result.tools.map((t) => (t.id === toolId ? { ...t, skills: [...t.skills, skill] } : t))
  };
  return next;
}

test("formatMcpOverview renders one MCP with its capability tag and a single config row", () => {
  let result = emptyResult();
  result = {
    ...result,
    homeDir: "/Users/test"
  };
  result = withMcp(
    result,
    "claude",
    makeMcpSkill({
      toolId: "claude",
      name: "GitHub",
      capabilityCategories: ["code_hosting"],
      accessLevel: "moderate",
      sourcePath: "/Users/test/.claude/.mcp.json"
    })
  );

  const output = formatMcpOverview(result);

  assert.match(
    output.split("\n")[0],
    /^Ankui MCP overview — 1 unique server, 1 configuration across 1 tool$/
  );
  assert.match(output, /\nGitHub  code_hosting · moderate\n/);
  assert.match(output, /\n  claude    ~\/\.claude\/\.mcp\.json\b/);
});

test("formatMcpOverview orders MCPs by descending configuration count, then by name", () => {
  let result = emptyResult();
  result = { ...result, homeDir: "/Users/test" };
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "Reddit", capabilityCategories: ["communication"], accessLevel: "moderate" }));
  result = withMcp(result, "gemini", makeMcpSkill({ toolId: "gemini", name: "Reddit", capabilityCategories: ["communication"], accessLevel: "moderate" }));
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "Context7", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "alpha", capabilityCategories: ["network"], accessLevel: "limited" }));

  const output = formatMcpOverview(result);

  const redditIdx = output.indexOf("\nReddit  ");
  const shadcnIdx = output.indexOf("\nshadcn  ");
  const context7Idx = output.indexOf("\nContext7  ");
  const alphaIdx = output.indexOf("\nalpha  ");

  assert.ok(redditIdx > 0 && redditIdx < shadcnIdx, "Reddit before shadcn (2-config tie, alpha)");
  assert.ok(shadcnIdx < alphaIdx, "1-config groups follow 2-config groups");
  assert.ok(alphaIdx < context7Idx, "alpha before Context7 (case-insensitive)");
});

test("formatMcpOverview header summarizes counts correctly with plural forms", () => {
  let result = emptyResult();
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "X", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "X", capabilityCategories: ["network"], accessLevel: "limited" }));

  assert.match(
    formatMcpOverview(result).split("\n")[0],
    /^Ankui MCP overview — 1 unique server, 2 configurations across 2 tools$/
  );
});

test("formatMcpOverview renders unknown MCPs with the '(uncatalogued)' label, not 'unknown · unknown'", () => {
  let result = emptyResult();
  result = withMcp(
    result,
    "claude",
    makeMcpSkill({
      toolId: "claude",
      name: "internal-mystery",
      capabilityCategories: ["unknown"],
      accessLevel: "unknown"
    })
  );

  const output = formatMcpOverview(result);
  assert.match(output, /\ninternal-mystery  \(uncatalogued\)\n/);
  assert.doesNotMatch(output, /unknown · unknown/);
});

test("formatMcpOverview annotates cross-tool duplicates with a ⚠ line", () => {
  let result = emptyResult();
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));

  const output = formatMcpOverview(result);
  assert.match(output, /shadcn[^\n]*\n  codex[^\n]*\n  cursor[^\n]*\n  ⚠ Configured in 2 tools/);
});

test("formatMcpOverview does NOT annotate single-tool MCPs as duplicated", () => {
  let result = emptyResult();
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Solo", capabilityCategories: ["network"], accessLevel: "limited" }));
  const output = formatMcpOverview(result);
  assert.doesNotMatch(output, /Configured in \d+ tools?/);
});

test("formatMcpOverview annotates secret-bearing env keys (union across configurations)", () => {
  let result = emptyResult();
  result = withMcp(
    result,
    "codex",
    makeMcpSkill({
      toolId: "codex",
      name: "Context7",
      capabilityCategories: ["network"],
      accessLevel: "limited",
      details: { envKeys: ["CONTEXT7_API_KEY", "DEBUG"] }
    })
  );

  const output = formatMcpOverview(result);
  assert.match(output, /⚠ Secret-bearing env keys: CONTEXT7_API_KEY/);
  assert.doesNotMatch(output, /DEBUG/);
});

test("formatMcpOverview emits both annotations when both conditions are true", () => {
  let result = emptyResult();
  result = withMcp(
    result,
    "codex",
    makeMcpSkill({
      toolId: "codex",
      name: "Both",
      capabilityCategories: ["database"],
      accessLevel: "broad",
      details: { envKeys: ["DATABASE_PASSWORD"] }
    })
  );
  result = withMcp(
    result,
    "claude",
    makeMcpSkill({
      toolId: "claude",
      name: "Both",
      capabilityCategories: ["database"],
      accessLevel: "broad",
      details: { envKeys: ["DATABASE_URL"] }
    })
  );

  const output = formatMcpOverview(result);
  assert.match(
    output,
    /Both[^\n]*\n  claude[^\n]*\n  codex[^\n]*\n  ⚠ Configured in 2 tools\n  ⚠ Secret-bearing env keys: DATABASE_PASSWORD/
  );
});

import { formatMcpOverviewJson } from "../../src/utils/format-mcp.js";

test("formatMcpOverviewJson returns a stable summary shape with groups + counts + tools list", () => {
  let result = emptyResult();
  result = {
    ...result,
    scannedAt: "2026-05-13T12:00:00.000Z",
    cwd: "/p",
    homeDir: "/h"
  };
  result = withMcp(result, "codex", makeMcpSkill({ toolId: "codex", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "shadcn", capabilityCategories: ["network"], accessLevel: "limited" }));
  result = withMcp(
    result,
    "codex",
    makeMcpSkill({
      toolId: "codex",
      name: "Context7",
      capabilityCategories: ["network"],
      accessLevel: "limited",
      details: { envKeys: ["CONTEXT7_API_KEY"] }
    })
  );

  const json = JSON.parse(formatMcpOverviewJson(result));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.cwd, "/p");
  assert.equal(json.homeDir, "/h");
  assert.equal(json.totalConfigurations, 3);
  assert.equal(json.uniqueServers, 2);
  assert.deepEqual(json.tools, ["codex", "cursor"]);
  assert.equal(json.servers.length, 2);

  const shadcn = json.servers.find((s: { name: string }) => s.name === "shadcn");
  assert.ok(shadcn, "shadcn must be present");
  assert.deepEqual(shadcn.capabilityCategories, ["network"]);
  assert.equal(shadcn.accessLevel, "limited");
  assert.equal(shadcn.configurations.length, 2);
  assert.equal(shadcn.duplicatedAcrossTools, true);
  assert.deepEqual(shadcn.secretEnvKeys, []);

  const context7 = json.servers.find((s: { name: string }) => s.name === "Context7");
  assert.ok(context7);
  assert.equal(context7.duplicatedAcrossTools, false);
  assert.deepEqual(context7.secretEnvKeys, ["CONTEXT7_API_KEY"]);
  assert.deepEqual(context7.configurations[0].envKeys, ["CONTEXT7_API_KEY"]);
});

test("formatMcpOverviewJson returns the zero-shape on empty input", () => {
  const json = JSON.parse(formatMcpOverviewJson(emptyResult()));
  assert.equal(json.totalConfigurations, 0);
  assert.equal(json.uniqueServers, 0);
  assert.deepEqual(json.tools, []);
  assert.deepEqual(json.servers, []);
});
