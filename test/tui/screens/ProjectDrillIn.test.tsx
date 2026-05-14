import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { ProjectDrillIn } from "../../../src/tui/screens/ProjectDrillIn.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type MultiProjectScanResult,
  type ProjectScan,
  type ScanResult,
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
