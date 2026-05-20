import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDoctorBoard,
  groupWarningsByReason
} from "../../../src/tui/util/doctor-grouping.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createWarning,
  type MultiProjectScanResult,
  type ScanResult,
  type ToolId
} from "../../../src/types.js";

function emptyScanResult(cwd = "/cwd", homeDir = "/home"): ScanResult {
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

function multiProjectFixture(input: {
  detected?: { toolId: ToolId; paths: string[] }[];
  warnings?: Array<{ reason: Parameters<typeof createWarning>[0]["reason"]; path?: string; message?: string }>;
  cwd?: string;
  homeDir?: string;
}): MultiProjectScanResult {
  const cwd = input.cwd ?? "/home/Developer/ankui";
  const homeDir = input.homeDir ?? "/home";
  const userScope = emptyScanResult(cwd, homeDir);
  for (const { toolId, paths } of input.detected ?? []) {
    userScope.tools = userScope.tools.map((t) =>
      t.id === toolId ? { ...t, detected: true, detectedPaths: paths } : t
    );
  }
  const warnings = (input.warnings ?? []).map((w) =>
    createWarning({ reason: w.reason, path: w.path, message: w.message ?? "" })
  );
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd,
    homeDir,
    devRoots: [],
    userScope,
    projects: [],
    warnings,
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("buildDoctorBoard renders every tool with detected state", () => {
  const board = buildDoctorBoard(
    multiProjectFixture({
      detected: [{ toolId: "claude", paths: ["/home/.claude"] }]
    })
  );
  const ids = board.map((row) => row.toolId);
  // All 7 MVP tools present, in TOOL_DEFINITIONS order.
  assert.deepEqual(ids, ["claude", "codex", "cursor", "gemini", "opencode", "antigravity", "skills-sh"]);
  const claude = board.find((r) => r.toolId === "claude");
  assert.equal(claude?.detected, true);
  assert.equal(board.find((r) => r.toolId === "codex")?.detected, false);
});

test("buildDoctorBoard classifies paths into user vs project scope by cwd prefix", () => {
  const board = buildDoctorBoard(
    multiProjectFixture({
      cwd: "/home/Developer/ankui",
      detected: [
        {
          toolId: "claude",
          paths: ["/home/.claude", "/home/Developer/ankui/.claude"]
        }
      ]
    })
  );
  const claude = board.find((r) => r.toolId === "claude")!;
  // User path renders home-relative.
  assert.deepEqual(claude.userPaths, ["~/.claude"]);
  // Project path renders cwd-relative, starting with "./".
  assert.deepEqual(claude.projectPaths, ["./.claude"]);
});

test("buildDoctorBoard returns empty path arrays for undetected tools", () => {
  const board = buildDoctorBoard(multiProjectFixture({}));
  for (const row of board) {
    assert.equal(row.detected, false);
    assert.deepEqual(row.userPaths, []);
    assert.deepEqual(row.projectPaths, []);
  }
});

test("groupWarningsByReason groups by reason and sorts by count desc then reason asc", () => {
  const groups = groupWarningsByReason(
    multiProjectFixture({
      warnings: [
        { reason: "symlink_skipped", path: "/a" },
        { reason: "symlink_skipped", path: "/b" },
        { reason: "parse_failed", path: "/c" },
        { reason: "permission_denied", path: "/d" },
        { reason: "permission_denied", path: "/e" }
      ]
    })
  );
  // symlink_skipped (2) and permission_denied (2) tied at top — sort by
  // reason asc: permission_denied < symlink_skipped. parse_failed (1) last.
  assert.deepEqual(
    groups.map((g) => g.reason),
    ["permission_denied", "symlink_skipped", "parse_failed"]
  );
  assert.equal(groups[0].warnings.length, 2);
});

test("groupWarningsByReason returns empty array when no warnings exist", () => {
  assert.deepEqual(groupWarningsByReason(multiProjectFixture({})), []);
});

test("buildDoctorBoard handles paths equal to cwd (project root itself)", () => {
  const board = buildDoctorBoard(
    multiProjectFixture({
      cwd: "/home/Developer/ankui",
      detected: [{ toolId: "claude", paths: ["/home/Developer/ankui"] }]
    })
  );
  const claude = board.find((r) => r.toolId === "claude")!;
  // Path === cwd → rendered as "."
  assert.deepEqual(claude.projectPaths, ["."]);
});
