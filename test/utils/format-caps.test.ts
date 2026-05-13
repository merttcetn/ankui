import assert from "node:assert/strict";
import test from "node:test";

import { formatCapabilities } from "../../src/utils/format-caps.js";
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

test("formatCapabilities returns the empty-state message when no classified MCPs exist", () => {
  const output = formatCapabilities(emptyResult());
  assert.match(output, /^Ankui capabilities — no classified MCPs\.\s*$/);
});

import { createSkillId, type AITool, type Skill } from "../../src/types.js";

function makeMcpSkill(input: {
  toolId: AITool["id"];
  name: string;
  capabilityCategories: Skill["capabilityCategories"];
  accessLevel: Skill["accessLevel"];
  scope?: Skill["scope"];
  sourcePath?: string;
}): Skill {
  const sourcePath = input.sourcePath ?? `/tmp/${input.name}.json`;
  return {
    id: createSkillId({ toolId: input.toolId, kind: "mcp_server", name: input.name, sourcePath }),
    toolId: input.toolId,
    kind: "mcp_server",
    name: input.name,
    summary: "",
    scope: input.scope ?? "user",
    sourcePath,
    source: "config",
    capabilityCategories: input.capabilityCategories,
    accessLevel: input.accessLevel,
    details: undefined
  };
}

function withMcp(result: ScanResult, toolId: AITool["id"], skill: Skill): ScanResult {
  return {
    ...result,
    tools: result.tools.map((t) => (t.id === toolId ? { ...t, skills: [...t.skills, skill] } : t))
  };
}

test("formatCapabilities groups MCPs by capability category with header counts", () => {
  let result = emptyResult();
  result = withMcp(result, "codex",  makeMcpSkill({ toolId: "codex",  name: "shadcn",   capabilityCategories: ["network"],       accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "shadcn",   capabilityCategories: ["network"],       accessLevel: "limited" }));
  result = withMcp(result, "codex",  makeMcpSkill({ toolId: "codex",  name: "Context7", capabilityCategories: ["network"],       accessLevel: "limited" }));
  result = withMcp(result, "codex",  makeMcpSkill({ toolId: "codex",  name: "Reddit",   capabilityCategories: ["communication"], accessLevel: "moderate" }));
  result = withMcp(result, "gemini", makeMcpSkill({ toolId: "gemini", name: "Reddit",   capabilityCategories: ["communication"], accessLevel: "moderate" }));

  const output = formatCapabilities(result);

  assert.match(
    output.split("\n")[0],
    /^Ankui capabilities — 3 classified MCPs across 2 categories$/
  );

  assert.match(output, /network \(2\)\n───────────\n  Context7 .*\n  shadcn /);
  assert.match(output, /communication \(1\)\n─────────────────\n  Reddit /);
  assert.match(output, /shadcn .*codex, cursor.*limited/);
  assert.match(output, /Reddit .*codex, gemini.*moderate/);
});

test("formatCapabilities orders categories by descending MCP count, then alphabetical", () => {
  let result = emptyResult();
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Aa", capabilityCategories: ["automation"], accessLevel: "moderate" }));
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Bb", capabilityCategories: ["database"],   accessLevel: "broad" }));
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Cc", capabilityCategories: ["database"],   accessLevel: "broad" }));
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Dd", capabilityCategories: ["browser"],    accessLevel: "moderate" }));
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Ee", capabilityCategories: ["browser"],    accessLevel: "moderate" }));

  const output = formatCapabilities(result);
  const browser = output.indexOf("browser (2)");
  const database = output.indexOf("database (2)");
  const automation = output.indexOf("automation (1)");
  assert.ok(browser >= 0 && database >= 0 && automation >= 0);
  assert.ok(browser < database, "browser before database (alpha tiebreak at count=2)");
  assert.ok(database < automation, "automation (count 1) after database (count 2)");
});

test("formatCapabilities appends a footer with the uncatalogued skill count", () => {
  let result = emptyResult();
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Postgres", capabilityCategories: ["database"], accessLevel: "broad" }));
  result = {
    ...result,
    tools: result.tools.map((t) =>
      t.id === "claude"
        ? {
            ...t,
            skills: [
              ...t.skills,
              {
                id: "x1",
                toolId: "claude",
                kind: "agent_skill",
                name: "do-stuff",
                summary: "",
                scope: "user",
                sourcePath: "/tmp/a",
                source: "directory",
                capabilityCategories: ["unknown"],
                accessLevel: "unknown"
              },
              {
                id: "x2",
                toolId: "claude",
                kind: "plugins",
                name: "p1",
                summary: "",
                scope: "user",
                sourcePath: "/tmp/p",
                source: "directory",
                capabilityCategories: ["unknown"],
                accessLevel: "unknown"
              },
              {
                id: "x3",
                toolId: "claude",
                kind: "rules",
                name: "r1",
                summary: "",
                scope: "user",
                sourcePath: "/tmp/r",
                source: "config",
                capabilityCategories: ["unknown"],
                accessLevel: "unknown"
              }
            ]
          }
        : t
    )
  };

  const output = formatCapabilities(result);
  assert.match(output, /3 uncatalogued skills/);
  assert.match(output, /agent_skill, plugins, rules/);
  assert.match(output, /Use `ankui show <tool>`/);
});

test("formatCapabilities does NOT emit a footer when no uncatalogued skills exist", () => {
  let result = emptyResult();
  result = withMcp(result, "claude", makeMcpSkill({ toolId: "claude", name: "Postgres", capabilityCategories: ["database"], accessLevel: "broad" }));

  const output = formatCapabilities(result);
  assert.doesNotMatch(output, /uncatalogued/);
});

import { formatCapabilitiesJson } from "../../src/utils/format-caps.js";

test("formatCapabilitiesJson returns metadata + categories + per-MCP detail", () => {
  let result = emptyResult();
  result = { ...result, scannedAt: "2026-05-13T12:00:00.000Z", cwd: "/p", homeDir: "/h" };
  result = withMcp(result, "codex",  makeMcpSkill({ toolId: "codex",  name: "shadcn",   capabilityCategories: ["network"],       accessLevel: "limited" }));
  result = withMcp(result, "cursor", makeMcpSkill({ toolId: "cursor", name: "shadcn",   capabilityCategories: ["network"],       accessLevel: "limited" }));
  result = withMcp(result, "gemini", makeMcpSkill({ toolId: "gemini", name: "Reddit",   capabilityCategories: ["communication"], accessLevel: "moderate" }));

  const json = JSON.parse(formatCapabilitiesJson(result));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.cwd, "/p");
  assert.equal(json.homeDir, "/h");
  assert.equal(json.totalClassifiedMcps, 2);
  assert.equal(json.totalCategories, 2);
  assert.equal(json.uncataloguedSkillCount, 0);

  const network = json.categories.find((c: { category: string }) => c.category === "network");
  assert.ok(network);
  assert.equal(network.mcpCount, 1);
  assert.deepEqual(network.mcps[0].tools.sort(), ["codex", "cursor"]);
  assert.equal(network.mcps[0].accessLevel, "limited");

  const communication = json.categories.find((c: { category: string }) => c.category === "communication");
  assert.equal(communication.mcps[0].name, "Reddit");
});

test("formatCapabilitiesJson returns the zero-shape on empty input", () => {
  const json = JSON.parse(formatCapabilitiesJson(emptyResult()));
  assert.equal(json.totalClassifiedMcps, 0);
  assert.equal(json.totalCategories, 0);
  assert.equal(json.uncataloguedSkillCount, 0);
  assert.deepEqual(json.categories, []);
});
