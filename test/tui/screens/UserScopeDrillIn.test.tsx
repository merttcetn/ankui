import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { UserScopeDrillIn } from "../../../src/tui/screens/UserScopeDrillIn.js";
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

function makeSkill(
  kind: SkillKind,
  name: string,
  toolId: ToolId,
  details?: Skill["details"]
): Skill {
  const sourcePath = `/home/.${toolId}/${name}`;
  return {
    id: createSkillId({ toolId, kind, name, sourcePath }),
    toolId,
    kind,
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "config",
    capabilityCategories: [],
    accessLevel: "moderate",
    details
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

function multiProjectFixture(skills: Skill[]): MultiProjectScanResult {
  const userScope = emptyScanResult();
  if (skills.length > 0) {
    const toolId = skills[0].toolId;
    userScope.tools = userScope.tools.map((t) =>
      t.id === toolId
        ? {
            ...t,
            detected: true,
            detectedPaths: [`/home/.${toolId}`],
            skills
          }
        : t
    );
  }
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: skills.length
    }
  };
}

test("UserScopeDrillIn filters skills by searchQuery substring (case-insensitive)", () => {
  const skills = [
    makeSkill("agent_skill", "deploy-app", "claude"),
    makeSkill("agent_skill", "verify-frontend", "claude"),
    makeSkill("agent_skill", "debug-helper", "claude")
  ];
  const inst = render(
    <UserScopeDrillIn
      toolId="claude"
      result={multiProjectFixture(skills)}
      searchQuery="VERIFY"
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /verify-frontend/);
  assert.doesNotMatch(frame, /deploy-app/);
  assert.doesNotMatch(frame, /debug-helper/);
  inst.unmount();
});

test("UserScopeDrillIn renders SearchBox when searchOpen is true", () => {
  const skills = [makeSkill("agent_skill", "deploy", "claude")];
  const inst = render(
    <UserScopeDrillIn
      toolId="claude"
      result={multiProjectFixture(skills)}
      searchOpen={true}
      searchQuery="dep"
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /\/dep/);
  inst.unmount();
});

test("UserScopeDrillIn renders the inline origin label for non-yours bundle skills", () => {
  const skill = makeSkill("agent_skill", "autoplan", "claude", {
    bundleOrigin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });
  const inst = render(
    <UserScopeDrillIn
      toolId="claude"
      result={multiProjectFixture([skill])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /autoplan/);
  assert.match(frame, /gstack/);
  assert.match(frame, /bundle/);
  inst.unmount();
});

test("UserScopeDrillIn ignores empty searchQuery (renders all skills)", () => {
  const skills = [
    makeSkill("agent_skill", "deploy", "claude"),
    makeSkill("agent_skill", "verify", "claude")
  ];
  const inst = render(
    <UserScopeDrillIn
      toolId="claude"
      result={multiProjectFixture(skills)}
      searchQuery=""
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /deploy/);
  assert.match(frame, /verify/);
  inst.unmount();
});
