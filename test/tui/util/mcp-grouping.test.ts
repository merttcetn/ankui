import assert from "node:assert/strict";
import test from "node:test";

import { aggregateMcps } from "../../../src/tui/util/mcp-grouping.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createSkillId,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill,
  type SkillKind,
  type ToolId
} from "../../../src/types.js";

function makeMcpSkill(
  toolId: ToolId,
  name: string,
  options: {
    scope?: Skill["scope"];
    sourcePath?: string;
    envKeys?: string[];
    capabilityCategories?: Skill["capabilityCategories"];
    accessLevel?: Skill["accessLevel"];
  } = {}
): Skill {
  const kind: SkillKind = "mcp_server";
  const sourcePath = options.sourcePath ?? `/tmp/${toolId}-${name}`;
  return {
    id: createSkillId({ toolId, kind, name, sourcePath }),
    toolId,
    kind,
    name,
    summary: "",
    scope: options.scope ?? "user",
    sourcePath,
    source: "config",
    capabilityCategories: options.capabilityCategories ?? ["database"],
    accessLevel: options.accessLevel ?? "moderate",
    details: options.envKeys ? { envKeys: options.envKeys } : undefined
  };
}

function emptyScanResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function multiProjectResult(input: {
  userSkills?: { toolId: ToolId; skill: Skill }[];
  projects?: { displayPath: string; skills: { toolId: ToolId; skill: Skill }[] }[];
}): MultiProjectScanResult {
  const userScope = emptyScanResult();
  for (const { toolId, skill } of input.userSkills ?? []) {
    userScope.tools = userScope.tools.map((t) =>
      t.id === toolId
        ? { ...t, detected: true, detectedPaths: ["/home/.x"], skills: [...t.skills, skill] }
        : t
    );
  }

  const projects = (input.projects ?? []).map((p) => {
    const scan = emptyScanResult();
    for (const { toolId, skill } of p.skills) {
      scan.tools = scan.tools.map((t) =>
        t.id === toolId ? { ...t, skills: [...t.skills, skill] } : t
      );
    }
    return { projectPath: `/p/${p.displayPath}`, displayPath: p.displayPath, scan };
  });

  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects,
    warnings: [],
    totals: { projectCount: projects.length, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("aggregateMcps returns empty array when no mcp_server skills exist", () => {
  const result = multiProjectResult({});
  assert.deepEqual(aggregateMcps(result), []);
});

test("aggregateMcps groups same-name MCPs across tools into one group", () => {
  const groups = aggregateMcps(
    multiProjectResult({
      userSkills: [
        { toolId: "claude", skill: makeMcpSkill("claude", "shadcn") },
        { toolId: "codex",  skill: makeMcpSkill("codex",  "shadcn") }
      ]
    })
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "shadcn");
  assert.equal(groups[0].configurations.length, 2);
  assert.equal(groups[0].duplicatedAcrossTools, true);
});

test("aggregateMcps merges user-scope and project skills under one group", () => {
  const groups = aggregateMcps(
    multiProjectResult({
      userSkills: [{ toolId: "claude", skill: makeMcpSkill("claude", "Postgres") }],
      projects: [
        {
          displayPath: "ankui",
          skills: [
            { toolId: "claude", skill: makeMcpSkill("claude", "Postgres", { scope: "project", sourcePath: "/p/ankui/.mcp.json" }) }
          ]
        }
      ]
    })
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].configurations.length, 2);
  // Both share the same toolId — not "duplicated across tools".
  assert.equal(groups[0].duplicatedAcrossTools, false);
});

test("aggregateMcps sorts groups by configuration count desc, then name asc", () => {
  const groups = aggregateMcps(
    multiProjectResult({
      userSkills: [
        { toolId: "claude", skill: makeMcpSkill("claude", "Beta") },
        { toolId: "claude", skill: makeMcpSkill("claude", "Alpha") },
        { toolId: "codex",  skill: makeMcpSkill("codex",  "Alpha") }
      ]
    })
  );
  // Alpha has 2 configs, Beta has 1 → Alpha first.
  assert.deepEqual(groups.map((g) => g.name), ["Alpha", "Beta"]);
});

test("aggregateMcps flags secret-bearing env keys", () => {
  const skill = makeMcpSkill("claude", "GitHub", {
    envKeys: ["GITHUB_TOKEN", "OTHER_VAR"]
  });
  const groups = aggregateMcps(
    multiProjectResult({ userSkills: [{ toolId: "claude", skill }] })
  );
  assert.deepEqual(groups[0].secretEnvKeys, ["GITHUB_TOKEN"]);
});

test("aggregateMcps surfaces capabilityCategories + accessLevel from the first skill seen", () => {
  const skill = makeMcpSkill("claude", "Postgres", {
    capabilityCategories: ["database"],
    accessLevel: "broad"
  });
  const groups = aggregateMcps(
    multiProjectResult({ userSkills: [{ toolId: "claude", skill }] })
  );
  assert.deepEqual(groups[0].capabilityCategories, ["database"]);
  assert.equal(groups[0].accessLevel, "broad");
});
