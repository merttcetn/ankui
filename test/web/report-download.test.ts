import assert from "node:assert/strict";
import test from "node:test";

import { createReportDownload } from "../../src/web-ui/report-download.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type MultiProjectScanResult,
  type ScanResult
} from "../../src/types.js";

function emptyScan(cwd: string, homeDir: string): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-07-05T09:00:00.000Z",
    cwd,
    homeDir,
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function multi(): MultiProjectScanResult {
  const homeDir = "/Users/alice";
  return {
    scannedAt: "2026-07-05T09:00:00.000Z",
    cwd: homeDir,
    homeDir,
    devRoots: ["/Users/alice/Developer"],
    userScope: emptyScan(homeDir, homeDir),
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: 0
    }
  };
}

test("createReportDownload returns Markdown payload and stable local filename", () => {
  const report = createReportDownload(
    multi(),
    new Date("2026-07-05T10:07:00")
  );

  assert.equal(report.filename, "ankui-report-2026-07-05-1007.md");
  assert.equal(report.mimeType, "text/markdown;charset=utf-8");
  assert.match(report.body, /^# Ankui Sanitized Report\n/);
  assert.match(report.body, /Privacy: strict/);
  assert.doesNotMatch(report.body, /\/Users\/alice/);
});
