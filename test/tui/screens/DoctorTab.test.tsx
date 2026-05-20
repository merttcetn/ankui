import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { DoctorTab } from "../../../src/tui/screens/DoctorTab.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createWarning,
  type MultiProjectScanResult,
  type ScanResult,
  type ToolId
} from "../../../src/types.js";

function emptyScanResult(cwd = "/home/Developer/ankui", homeDir = "/home"): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd,
    homeDir,
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function fixture(input: {
  detected?: { toolId: ToolId; paths: string[] }[];
  warnings?: Array<{ reason: Parameters<typeof createWarning>[0]["reason"]; path?: string }>;
}): MultiProjectScanResult {
  const userScope = emptyScanResult();
  for (const { toolId, paths } of input.detected ?? []) {
    userScope.tools = userScope.tools.map((t) =>
      t.id === toolId ? { ...t, detected: true, detectedPaths: paths } : t
    );
  }
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/home/Developer/ankui",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: (input.warnings ?? []).map((w) =>
      createWarning({ reason: w.reason, path: w.path, message: "" })
    ),
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("DoctorTab renders the 'DOCTOR' header and summary line", () => {
  const inst = render(
    <DoctorTab
      result={fixture({
        detected: [{ toolId: "claude", paths: ["/home/.claude"] }]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /D O C T O R/);
  // 7 tools (MVP count), 1 detected, 0 warnings.
  assert.match(frame, /7 tools.*1 detected.*0 warnings/);
  inst.unmount();
});

test("DoctorTab renders a row per tool with detected/not-detected state", () => {
  const inst = render(
    <DoctorTab
      result={fixture({
        detected: [{ toolId: "claude", paths: ["/home/.claude"] }]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  // Claude detected with the user path rendered home-relative.
  assert.match(frame, /Claude/);
  assert.match(frame, /~\/\.claude/);
  // Cursor not detected.
  assert.match(frame, /Cursor.*not detected/);
  inst.unmount();
});

test("DoctorTab splits paths into user and project sub-lists", () => {
  const inst = render(
    <DoctorTab
      result={fixture({
        detected: [
          {
            toolId: "claude",
            paths: ["/home/.claude", "/home/Developer/ankui/.claude"]
          }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  // Both labels and both relativized paths visible.
  assert.match(frame, /user:/);
  assert.match(frame, /~\/\.claude/);
  assert.match(frame, /project:/);
  assert.match(frame, /\.\/\.claude/);
  inst.unmount();
});

test("DoctorTab shows 'No warnings.' when result.warnings is empty", () => {
  const inst = render(<DoctorTab result={fixture({})} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /No warnings\./);
  inst.unmount();
});

test("DoctorTab renders the noWarnings whisper when warnings array is empty", () => {
  const inst = render(<DoctorTab result={fixture({})} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /quiet tonight\./);
  inst.unmount();
});

test("DoctorTab groups warnings by reason with count and path", () => {
  const inst = render(
    <DoctorTab
      result={fixture({
        warnings: [
          { reason: "symlink_skipped", path: "/home/x" },
          { reason: "symlink_skipped", path: "/home/y" },
          { reason: "parse_failed",    path: "/home/z" }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  // Highest-count group first.
  assert.match(frame, /symlink_skipped/);
  assert.match(frame, /parse_failed/);
  assert.match(frame, /~\/x/);
  assert.match(frame, /~\/z/);
  inst.unmount();
});
