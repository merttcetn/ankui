import assert from "node:assert/strict";
import test from "node:test";

import { diffSnapshots } from "../../src/snapshots/diff.js";
import { buildSnapshotDocument } from "../../src/snapshots/model.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createSkillId,
  createToolStats,
  type MultiProjectScanResult,
  type Skill
} from "../../src/types.js";

function skill(home: string, overrides: Partial<Skill> = {}): Skill {
  const base = {
    toolId: "claude" as const,
    kind: "agent_skill" as const,
    name: "review",
    summary: "Review code",
    scope: "user" as const,
    sourcePath: `${home}/.claude/skills/review/SKILL.md`,
    source: "directory" as const,
    capabilityCategories: [],
    accessLevel: "limited" as const,
    details: {
      preview: { sourcePath: "secret", lines: ["TOKEN=secret"], truncated: false },
      lineCount: 99,
      disabled: false,
      linked: true,
      linkTarget: `${home}/.ankui/bundles/acme/review/SKILL.md`
    },
    ...overrides
  };
  return { ...base, id: createSkillId(base) };
}

function resultWithSkill(entry: Skill): MultiProjectScanResult {
  const tools = createAllEmptyTools();
  const claude = tools.find((tool) => tool.id === "claude")!;
  claude.detected = true;
  claude.skills = [entry];
  claude.stats = createToolStats(claude.skills, []);
  const scan = {
    scannedAt: "2026-07-06T10:00:00.000Z",
    cwd: "/home/test",
    homeDir: "/home/test",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
  return {
    scannedAt: scan.scannedAt,
    cwd: scan.cwd,
    homeDir: scan.homeDir,
    devRoots: [],
    userScope: scan,
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 1 }
  };
}

test("snapshot projection keeps safe semantic fields and excludes previews", () => {
  const document = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  assert.equal(document.entities.length, 1);
  assert.equal(document.entities[0].sourcePath, "~/.claude/skills/review/SKILL.md");
  assert.deepEqual(document.entities[0].attributes, {
    disabled: false,
    linked: true,
    linkTarget: "~/.ankui/bundles/acme/review/SKILL.md"
  });
  assert.doesNotMatch(JSON.stringify(document), /TOKEN=secret|lineCount|preview/);
});

test("semantic diff reports nested before/after fields", () => {
  const before = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  const changed = skill("/home/test", {
    accessLevel: "broad",
    details: { disabled: true }
  });
  const after = buildSnapshotDocument(resultWithSkill(changed), {
    id: "current",
    createdAt: "2026-07-06T11:00:00.000Z"
  });
  const diff = diffSnapshots(before, after, { toCurrent: true });
  assert.equal(diff.summary.modified, 1);
  const fields = diff.changes[0].fields;
  assert.deepEqual(fields.find((field) => field.field === "accessLevel"), {
    field: "accessLevel",
    before: "limited",
    after: "broad"
  });
  assert.deepEqual(fields.find((field) => field.field === "attributes.disabled"), {
    field: "attributes.disabled",
    before: false,
    after: true
  });
});

test("renaming an entity is represented as remove plus add", () => {
  const before = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  const renamed = skill("/home/test", {
    name: "audit",
    sourcePath: "/home/test/.claude/skills/audit/SKILL.md"
  });
  const after = buildSnapshotDocument(resultWithSkill(renamed), {
    id: "current"
  });
  const diff = diffSnapshots(before, after, { toCurrent: true });
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.removed, 1);
  assert.equal(diff.summary.modified, 0);
});

test("project contexts exclude repeated user-scope entities", () => {
  const userSkill = skill("/home/test");
  const result = resultWithSkill(userSkill);
  const projectSkill = skill("/home/test", {
    name: "project-review",
    scope: "project",
    sourcePath: "/home/test/work/app/.claude/skills/project-review/SKILL.md"
  });
  const projectTools = createAllEmptyTools();
  const claude = projectTools.find((tool) => tool.id === "claude")!;
  claude.detected = true;
  claude.skills = [userSkill, projectSkill];
  claude.stats = createToolStats(claude.skills, []);
  result.projects = [{
    projectPath: "/home/test/work/app",
    displayPath: "~/work/app",
    scan: {
      scannedAt: result.scannedAt,
      cwd: "/home/test/work/app",
      homeDir: result.homeDir,
      tools: projectTools,
      findings: [],
      warnings: [],
      summary: createScanSummary(projectTools)
    }
  }];
  result.totals = { projectCount: 1, userScopeSkills: 1, skillsAcrossProjects: 2 };

  const document = buildSnapshotDocument(result, {
    id: "20260706T100000000Z-1234abcd"
  });
  assert.equal(document.entities.length, 2);
  assert.equal(document.entities.filter((entity) => entity.context === "user").length, 1);
  assert.equal(document.entities.filter((entity) => entity.context.startsWith("project:")).length, 1);
});

test("adapter timeouts suppress unreliable inventory removals and stay in scan health", () => {
  const before = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  before.warnings.push({
    key: "user|warning|adapter_timeout|claude",
    context: "user",
    reason: "adapter_timeout",
    message: "Skipped claude adapter results because scanning exceeded 1000ms."
  });
  const after = { ...before, id: "current", tools: [], entities: [], warnings: [] };
  const diff = diffSnapshots(before, after, { toCurrent: true });
  assert.equal(diff.summary.total, 0);
  assert.deepEqual(diff.summary.scanHealth, { total: 1, added: 0, removed: 1 });
  assert.equal(diff.changes.filter((change) => change.kind !== "warning").length, 0);
});

test("disabling a skill is one modified entity instead of remove plus add", () => {
  const before = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  const disabled = skill("/home/test", {
    sourcePath: "/home/test/.claude/skills/.disabled/review/SKILL.md",
    details: { disabled: true }
  });
  const after = buildSnapshotDocument(resultWithSkill(disabled), {
    id: "current",
    createdAt: "2026-07-06T11:00:00.000Z"
  });
  const diff = diffSnapshots(before, after, { toCurrent: true });
  assert.equal(diff.summary.added, 0);
  assert.equal(diff.summary.removed, 0);
  assert.equal(diff.summary.modified, 1);
  assert.deepEqual(
    diff.changes[0].fields.find((field) => field.field === "attributes.disabled"),
    { field: "attributes.disabled", before: false, after: true }
  );
});

test("findings survive enable/disable path moves without added/removed churn", () => {
  const before = buildSnapshotDocument(resultWithSkill(skill("/home/test")), {
    id: "20260706T100000000Z-1234abcd"
  });
  const disabled = skill("/home/test", {
    sourcePath: "/home/test/.claude/skills/.disabled/review/SKILL.md",
    details: { disabled: true }
  });
  const after = buildSnapshotDocument(resultWithSkill(disabled), { id: "current" });
  const baseFinding = {
    context: "user",
    title: "review contains review-worthy command patterns",
    category: "dangerous_pattern" as const,
    severity: "high" as const,
    accessLevel: "moderate" as const,
    scope: "user" as const,
    toolIds: ["claude" as const]
  };
  before.findings = [{
    ...baseFinding,
    key: `user|finding|dangerous_pattern|claude|${before.entities[0].key}`,
    relatedEntityKeys: [before.entities[0].key]
  }];
  after.findings = [{
    ...baseFinding,
    key: `user|finding|dangerous_pattern|claude|${after.entities[0].key.replace("/skills/review/", "/skills/.disabled/review/")}`,
    relatedEntityKeys: [after.entities[0].key.replace("/skills/review/", "/skills/.disabled/review/")]
  }];
  const diff = diffSnapshots(before, after, { toCurrent: true });
  assert.equal(diff.changes.filter((change) => change.kind === "finding").length, 0);
});
