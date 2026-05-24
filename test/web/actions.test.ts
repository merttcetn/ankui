import test from "node:test";
import assert from "node:assert/strict";

import { applyActions, type ApplyActionsDeps } from "../../src/web/actions.js";
import type { MultiProjectScanResult, Skill } from "../../src/types.js";

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: "claude:agent_skill:demo:/home/u/.claude/skills/demo/SKILL.md",
    toolId: "claude",
    kind: "agent_skill",
    name: "demo",
    summary: "",
    scope: "user",
    sourcePath: "/home/u/.claude/skills/demo/SKILL.md",
    source: "file",
    capabilityCategories: [],
    accessLevel: "unknown",
    details: {},
    ...over
  };
}

function makeResult(skills: Skill[]): MultiProjectScanResult {
  return {
    scannedAt: "2026-05-22T00:00:00.000Z",
    cwd: "/home/u",
    homeDir: "/home/u",
    devRoots: [],
    userScope: {
      scannedAt: "2026-05-22T00:00:00.000Z",
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: [
        {
          id: "claude",
          name: "Claude",
          description: "",
          detected: true,
          detectedPaths: [],
          skills,
          findings: [],
          warnings: [],
          stats: {
            mcpServers: 0,
            customCommands: 0,
            customAgents: 0,
            customPrompts: 0,
            customTools: 0,
            plugins: 0,
            rules: 0,
            memoryFiles: 0,
            agentSkills: skills.length,
            skillsShSkills: 0,
            findings: 0
          }
        }
      ],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 1,
        totalSkills: skills.length,
        totalMcpServers: 0,
        uniqueMcpServers: 0,
        customCommands: 0,
        customTools: 0,
        plugins: 0,
        memoryFiles: 0,
        agentSkills: skills.length,
        skillsShSkills: 0,
        totalFindings: 0,
        broadAccessFindings: 0
      }
    },
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: skills.length
    }
  };
}

test("applyActions enables a disabled skill via the writer", async () => {
  const skill = makeSkill({ details: { disabled: true } });
  const calls: string[] = [];
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([skill]),
    disableSkill: async () => {
      throw new Error("should not be called");
    },
    enableSkill: async (s) => {
      calls.push(`enable:${s.name}`);
      return { ok: true, newSourcePath: "/home/u/.claude/skills/demo/SKILL.md" };
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: skill.id, action: "enable" }],
    deps
  );

  assert.deepEqual(calls, ["enable:demo"]);
  assert.equal(outcomes[0].ok, true);
  assert.match(outcomes[0].message, /enabled/);
});

test("applyActions disables an enabled skill via the writer", async () => {
  const skill = makeSkill({ details: {} });
  const calls: string[] = [];
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([skill]),
    disableSkill: async (s) => {
      calls.push(`disable:${s.name}`);
      return { ok: true, newSourcePath: "/home/u/.claude/skills/.disabled/demo/SKILL.md" };
    },
    enableSkill: async () => {
      throw new Error("should not be called");
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: skill.id, action: "disable" }],
    deps
  );

  assert.deepEqual(calls, ["disable:demo"]);
  assert.equal(outcomes[0].ok, true);
});

test("applyActions refuses to act on a non-markdown skill id", async () => {
  // Regression: an authenticated /api/actions caller used to be able to
  // pass an MCP-server skill id (or plugin/rule/memory_file) and have the
  // writer rename the host tool's whole config directory into .disabled/.
  // Now those kinds resolve to "skill not found" before the writer runs.
  const mcpSkill = makeSkill({
    id: "claude:mcp_server:something:/home/u/.claude/settings.json",
    kind: "mcp_server",
    name: "something",
    sourcePath: "/home/u/.claude/settings.json"
  });
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([mcpSkill]),
    disableSkill: async () => {
      throw new Error("writer must not be called for a non-markdown skill");
    },
    enableSkill: async () => {
      throw new Error("writer must not be called for a non-markdown skill");
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: mcpSkill.id, action: "disable" }],
    deps
  );

  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].message, /not found/);
});

test("applyActions reports an unknown skill id without calling the writer", async () => {
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([]),
    disableSkill: async () => {
      throw new Error("should not be called");
    },
    enableSkill: async () => {
      throw new Error("should not be called");
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: "missing", action: "disable" }],
    deps
  );

  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].message, /not found/);
});

test("applyActions treats an already-disabled skill as a no-op success", async () => {
  const skill = makeSkill({ details: { disabled: true } });
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([skill]),
    disableSkill: async () => {
      throw new Error("should not be called");
    },
    enableSkill: async () => {
      throw new Error("should not be called");
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: skill.id, action: "disable" }],
    deps
  );

  assert.equal(outcomes[0].ok, true);
  assert.match(outcomes[0].message, /already/);
});

test("applyActions surfaces a writer failure reason", async () => {
  const skill = makeSkill({ details: {} });
  const deps: ApplyActionsDeps = {
    loadScan: async () => makeResult([skill]),
    disableSkill: async () => ({
      ok: false,
      reason: "target_exists",
      message: "rename target already exists"
    }),
    enableSkill: async () => {
      throw new Error("should not be called");
    },
    homeDir: "/home/u"
  };

  const { outcomes } = await applyActions(
    [{ skillId: skill.id, action: "disable" }],
    deps
  );

  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].message, /target already exists/);
});
