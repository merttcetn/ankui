import assert from "node:assert/strict";
import test from "node:test";

import { buildSkill } from "../../src/scanner/adapters/shared.js";
import {
  detectBundleOrigin,
  enrichMultiProjectWithBundleOrigin,
  enrichScanResultWithBundleOrigin,
  enrichSkillsWithBundleOrigin,
  type BundleOrigin
} from "../../src/scanner/bundle-origin.js";
import {
  createMultiProjectTotals,
  createScanSummary,
  createToolStats,
  type AITool,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill
} from "../../src/types.js";

function makeSkill(overrides: {
  sourcePath: string;
  details?: Record<string, unknown>;
  source?: Skill["source"];
  toolId?: Skill["toolId"];
  kind?: Skill["kind"];
  name?: string;
}): Skill {
  return buildSkill({
    toolId: overrides.toolId ?? "claude",
    kind: overrides.kind ?? "agent_skill",
    name: overrides.name ?? "test-skill",
    summary: "Test skill.",
    scope: "user",
    sourcePath: overrides.sourcePath,
    source: overrides.source ?? "directory",
    details: overrides.details
  });
}

test("detectBundleOrigin: builtin skill returns kind=builtin, name=toolId", () => {
  const skill = makeSkill({
    toolId: "claude",
    source: "builtin",
    sourcePath: "<builtin:claude>",
    details: { builtin: true }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "builtin");
  assert.equal(origin.name, "claude");
  assert.equal(origin.rootPath, undefined);
});

test("detectBundleOrigin: plugin marketplace path returns kind=plugin", () => {
  const skill = makeSkill({
    sourcePath:
      "/Users/me/.claude/plugins/cache/gstack-marketplace/superpowers/1.2.3/SKILL.md"
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "plugin");
  assert.equal(origin.name, "superpowers");
  assert.equal(
    origin.rootPath,
    "~/.claude/plugins/cache/gstack-marketplace/superpowers/1.2.3"
  );
});

test("detectBundleOrigin: plugin path with deeper nesting still stops at version", () => {
  const skill = makeSkill({
    sourcePath:
      "/Users/me/.claude/plugins/cache/marketplace-a/plugin-b/2.0.0/skills/foo/SKILL.md"
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "plugin");
  assert.equal(origin.name, "plugin-b");
  assert.equal(origin.rootPath, "~/.claude/plugins/cache/marketplace-a/plugin-b/2.0.0");
});

test("detectBundleOrigin: ankui bundles linkTarget returns kind=bundle, name=<owner>/<repo>", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/foo/SKILL.md",
    details: { linkTarget: "~/.ankui/bundles/wshobson/agents/foo/SKILL.md" }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "bundle");
  assert.equal(origin.name, "wshobson/agents");
  assert.equal(origin.rootPath, "~/.ankui/bundles/wshobson/agents");
});

test("detectBundleOrigin: general bundle linkTarget under ~/gstack", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/autoplan/SKILL.md",
    details: { linkTarget: "~/gstack/autoplan/SKILL.md" }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "bundle");
  assert.equal(origin.name, "gstack");
  assert.equal(origin.rootPath, "~/gstack");
});

test("detectBundleOrigin: general bundle linkTarget under ~/Code", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/x/SKILL.md",
    details: { linkTarget: "~/Code/random-name/skill.md" }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "bundle");
  assert.equal(origin.name, "Code");
  assert.equal(origin.rootPath, "~/Code");
});

test("detectBundleOrigin: external linkTarget (absolute, no ~) returns kind=external", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/x/SKILL.md",
    details: { linkTarget: "/opt/something/skill.md" }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "external");
  assert.equal(origin.name, "external");
  assert.equal(origin.rootPath, undefined);
});

test("detectBundleOrigin: no linkTarget, not builtin, not plugin returns kind=yours", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/mine/SKILL.md"
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "yours");
  assert.equal(origin.name, "yours");
  assert.equal(origin.rootPath, undefined);
});

test("detectBundleOrigin: ankui bundles rule wins over general bundle (.ankui)", () => {
  const skill = makeSkill({
    sourcePath: "/Users/me/.claude/skills/foo/SKILL.md",
    details: { linkTarget: "~/.ankui/bundles/anthropics/claude-skills/foo/SKILL.md" }
  });
  const origin = detectBundleOrigin(skill);
  assert.equal(origin.kind, "bundle");
  assert.equal(origin.name, "anthropics/claude-skills");
});

test("enrichSkillsWithBundleOrigin: writes details.bundleOrigin on every skill", () => {
  const skills: Skill[] = [
    makeSkill({
      sourcePath: "/Users/me/.claude/skills/a/SKILL.md",
      details: { linkTarget: "~/gstack/a/SKILL.md" }
    }),
    makeSkill({
      sourcePath: "/Users/me/.claude/skills/b/SKILL.md"
    }),
    makeSkill({
      source: "builtin",
      sourcePath: "<builtin:claude>",
      details: { builtin: true }
    })
  ];
  const enriched = enrichSkillsWithBundleOrigin(skills);
  assert.equal(enriched.length, 3);
  for (const skill of enriched) {
    assert.ok(skill.details);
    const origin = skill.details.bundleOrigin as BundleOrigin | undefined;
    assert.ok(origin, "expected bundleOrigin on every skill");
    assert.ok(["builtin", "plugin", "bundle", "yours", "external"].includes(origin.kind));
  }
  assert.equal(
    (enriched[0].details?.bundleOrigin as BundleOrigin).kind,
    "bundle"
  );
  assert.equal(
    (enriched[1].details?.bundleOrigin as BundleOrigin).kind,
    "yours"
  );
  assert.equal(
    (enriched[2].details?.bundleOrigin as BundleOrigin).kind,
    "builtin"
  );
});

test("enrichScanResultWithBundleOrigin: enriches every tool's skills and is idempotent", () => {
  const claudeSkill = makeSkill({
    toolId: "claude",
    sourcePath: "/Users/me/.claude/skills/a/SKILL.md",
    details: { linkTarget: "~/gstack/a/SKILL.md" }
  });
  const codexSkill = makeSkill({
    toolId: "codex",
    sourcePath: "/Users/me/.codex/skills/b/SKILL.md"
  });

  const claudeTool: AITool = {
    id: "claude",
    name: "Claude",
    description: "",
    detected: true,
    detectedPaths: [],
    skills: [claudeSkill],
    findings: [],
    warnings: [],
    stats: createToolStats([claudeSkill], [])
  };
  const codexTool: AITool = {
    id: "codex",
    name: "Codex",
    description: "",
    detected: true,
    detectedPaths: [],
    skills: [codexSkill],
    findings: [],
    warnings: [],
    stats: createToolStats([codexSkill], [])
  };

  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    cwd: "/Users/me",
    homeDir: "/Users/me",
    tools: [claudeTool, codexTool],
    findings: [],
    warnings: [],
    summary: createScanSummary([claudeTool, codexTool])
  };

  const enrichedOnce = enrichScanResultWithBundleOrigin(result);
  for (const tool of enrichedOnce.tools) {
    for (const skill of tool.skills) {
      assert.ok(skill.details?.bundleOrigin, "bundleOrigin missing after first enrichment");
    }
  }

  // Idempotent: re-running gives the same result (no accumulation)
  const enrichedTwice = enrichScanResultWithBundleOrigin(enrichedOnce);
  const firstClaude = enrichedOnce.tools[0].skills[0].details?.bundleOrigin as BundleOrigin;
  const secondClaude = enrichedTwice.tools[0].skills[0].details?.bundleOrigin as BundleOrigin;
  assert.deepEqual(secondClaude, firstClaude);
  const firstCodex = enrichedOnce.tools[1].skills[0].details?.bundleOrigin as BundleOrigin;
  const secondCodex = enrichedTwice.tools[1].skills[0].details?.bundleOrigin as BundleOrigin;
  assert.deepEqual(secondCodex, firstCodex);
});

test("enrichMultiProjectWithBundleOrigin: enriches userScope and every project scan", () => {
  const userScopeSkill = makeSkill({
    toolId: "claude",
    sourcePath: "/Users/me/.claude/skills/autoplan/SKILL.md",
    details: { linkTarget: "~/gstack/autoplan/SKILL.md" }
  });
  const projectSkill = makeSkill({
    toolId: "claude",
    sourcePath: "/Users/me/work/proj/.claude/skills/local/SKILL.md"
  });

  const userScopeTool: AITool = {
    id: "claude",
    name: "Claude",
    description: "",
    detected: true,
    detectedPaths: [],
    skills: [userScopeSkill],
    findings: [],
    warnings: [],
    stats: createToolStats([userScopeSkill], [])
  };
  const projectTool: AITool = {
    id: "claude",
    name: "Claude",
    description: "",
    detected: true,
    detectedPaths: [],
    skills: [projectSkill],
    findings: [],
    warnings: [],
    stats: createToolStats([projectSkill], [])
  };

  const userScope: ScanResult = {
    scannedAt: new Date().toISOString(),
    cwd: "/Users/me",
    homeDir: "/Users/me",
    tools: [userScopeTool],
    findings: [],
    warnings: [],
    summary: createScanSummary([userScopeTool])
  };
  const projectScan: ScanResult = {
    scannedAt: new Date().toISOString(),
    cwd: "/Users/me/work/proj",
    homeDir: "/Users/me",
    tools: [projectTool],
    findings: [],
    warnings: [],
    summary: createScanSummary([projectTool])
  };

  const multi: MultiProjectScanResult = {
    scannedAt: new Date().toISOString(),
    cwd: "/Users/me",
    homeDir: "/Users/me",
    devRoots: ["/Users/me/work"],
    userScope,
    projects: [
      {
        projectPath: "/Users/me/work/proj",
        displayPath: "~/work/proj",
        scan: projectScan
      }
    ],
    warnings: [],
    totals: createMultiProjectTotals({
      userScopeSkillCount: 1,
      projectSkillCounts: [1]
    })
  };

  const enriched = enrichMultiProjectWithBundleOrigin(multi);
  const enrichedUserSkill = enriched.userScope.tools[0].skills[0];
  const enrichedProjectSkill = enriched.projects[0].scan.tools[0].skills[0];
  const userOrigin = enrichedUserSkill.details?.bundleOrigin as BundleOrigin | undefined;
  const projectOrigin = enrichedProjectSkill.details?.bundleOrigin as BundleOrigin | undefined;

  assert.ok(userOrigin, "expected bundleOrigin on userScope skill");
  assert.equal(userOrigin.kind, "bundle");
  assert.equal(userOrigin.name, "gstack");
  assert.ok(projectOrigin, "expected bundleOrigin on project skill");
  assert.equal(projectOrigin.kind, "yours");
});
