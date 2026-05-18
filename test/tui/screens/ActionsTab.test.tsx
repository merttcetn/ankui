import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { ActionsTab } from "../../../src/tui/screens/ActionsTab.js";
import { createSkillId, type MultiProjectScanResult, type Skill } from "../../../src/types.js";

function activeSkill(name: string): Skill {
  const sourcePath = `/home/.claude/skills/${name}/SKILL.md`;
  return {
    id: createSkillId({ toolId: "claude", kind: "agent_skill", name, sourcePath }),
    toolId: "claude",
    kind: "agent_skill",
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "file",
    capabilityCategories: [],
    accessLevel: "moderate"
  };
}

function disabledSkill(name: string): Skill {
  return { ...activeSkill(name), sourcePath: `/home/.claude/skills/.disabled/${name}/SKILL.md`, details: { disabled: true } };
}

function resultWith(skills: Skill[]): MultiProjectScanResult {
  // Minimal MultiProjectScanResult; only the userScope.tools[].skills path is read by ActionsTab.
  const tools = [
    { id: "claude" as const, detected: true, detectedPaths: [], skills, findings: [], stats: {} as any, warnings: [] }
  ];
  return {
    scannedAt: "2026-05-18T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope: { scannedAt: "x", cwd: "/cwd", homeDir: "/home", tools: tools as any, findings: [], warnings: [], summary: {} as any },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: skills.length }
  };
}

test("ActionsTab lists each skill with its active or disabled state", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), disabledSkill("bravo")])}
      cursor={0}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /alpha/);
  assert.match(frame, /bravo/);
  assert.match(frame, /● alpha/);     // active marker
  assert.match(frame, /○ bravo/);     // disabled marker
  inst.unmount();
});

test("ActionsTab highlights the cursor row", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), activeSkill("bravo")])}
      cursor={1}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /▶\s+● bravo/);  // ACTIVE_PREFIX from icons.ts on the cursor row
  inst.unmount();
});
