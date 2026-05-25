import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { ProjectDrillIn } from "../../../src/tui/screens/ProjectDrillIn.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createSkillId,
  type MultiProjectScanResult,
  type ProjectScan,
  type ScanResult,
  type Skill,
  type SkillKind,
  type ToolId
} from "../../../src/types.js";

function emptyScanResult(cwd = "/home/Developer/proj"): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd,
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function projectFixture(projectPath: string, displayPath: string): ProjectScan {
  return {
    projectPath,
    displayPath,
    scan: emptyScanResult(projectPath)
  };
}

function fixtureWithProject(projects: ProjectScan[]): MultiProjectScanResult {
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/home/Developer/proj",
    homeDir: "/home",
    devRoots: [],
    userScope: emptyScanResult(),
    projects,
    warnings: [],
    totals: {
      projectCount: projects.length,
      skillsAcrossProjects: 0,
      userScopeSkills: 0
    }
  };
}

const TOOL: ToolId = "claude";

test("ProjectDrillIn renders the noProjectSkills whisper when project has no skills", () => {
  const project = projectFixture("/p/ankui", "ankui");
  const inst = render(
    <ProjectDrillIn
      toolId={TOOL}
      projectPath="/p/ankui"
      result={fixtureWithProject([project])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /nothing left here to remember\./);
  inst.unmount();
});

function makeSkill(
  kind: SkillKind,
  name: string,
  toolId: ToolId,
  details?: Skill["details"]
): Skill {
  const sourcePath = `/p/ankui/.${toolId}/${name}`;
  return {
    id: createSkillId({ toolId, kind, name, sourcePath }),
    toolId,
    kind,
    name,
    summary: "",
    scope: "project",
    sourcePath,
    source: "config",
    capabilityCategories: [],
    accessLevel: "moderate",
    details
  };
}

function projectFixtureWithSkills(
  projectPath: string,
  displayPath: string,
  toolId: ToolId,
  skills: Skill[]
): ProjectScan {
  const scan = emptyScanResult(projectPath);
  scan.tools = scan.tools.map((t) =>
    t.id === toolId
      ? { ...t, detected: true, detectedPaths: [`${projectPath}/.${toolId}`], skills }
      : t
  );
  return { projectPath, displayPath, scan };
}

test("ProjectDrillIn renders the inline origin label for non-yours bundle skills", () => {
  const skill = makeSkill("agent_skill", "autoplan", TOOL, {
    bundleOrigin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });
  const project = projectFixtureWithSkills("/p/ankui", "ankui", TOOL, [skill]);
  const inst = render(
    <ProjectDrillIn
      toolId={TOOL}
      projectPath="/p/ankui"
      result={fixtureWithProject([project])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /autoplan/);
  assert.match(frame, /gstack/);
  assert.match(frame, /bundle/);
  inst.unmount();
});
