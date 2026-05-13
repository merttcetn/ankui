import assert from "node:assert/strict";
import test from "node:test";

import { formatDoctor } from "../../src/utils/format-doctor.js";
import { createScanSummary, createAllEmptyTools, type ScanResult } from "../../src/types.js";

function emptyResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd: "/tmp/cwd",
    homeDir: "/tmp/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

test("formatDoctor renders header with zero counts when nothing is detected", () => {
  const output = formatDoctor(emptyResult());
  assert.match(
    output.split("\n")[0],
    /^Ankui doctor — 0 detected tools, 0 warnings$/
  );
});

test("formatDoctor ends with 'No warnings.' when warnings is empty", () => {
  const output = formatDoctor(emptyResult());
  assert.match(output, /\nNo warnings\.\s*$/);
});

import { type ToolId } from "../../src/types.js";

function withDetectedTool(
  result: ScanResult,
  toolId: ToolId,
  detectedPaths: string[]
): ScanResult {
  return {
    ...result,
    tools: result.tools.map((t) =>
      t.id === toolId ? { ...t, detected: true, detectedPaths } : t
    )
  };
}

test("formatDoctor groups detected paths by scope (user vs project)", () => {
  let result = emptyResult();
  result = { ...result, cwd: "/Users/x/proj", homeDir: "/Users/x" };
  // Claude: 2 user, 2 project
  result = withDetectedTool(result, "claude", [
    "/Users/x/.claude",
    "/Users/x/.claude.json",
    "/Users/x/proj/.claude",
    "/Users/x/proj/.claude/settings.local.json"
  ]);
  // Codex: 1 user only
  result = withDetectedTool(result, "codex", ["/Users/x/.codex"]);

  const output = formatDoctor(result);

  assert.match(output.split("\n")[0], /^Ankui doctor — 2 detected tools, 0 warnings$/);

  // Claude block: both scope labels, indented paths
  assert.match(
    output,
    /✓ Claude\n    user:\n      ~\/\.claude\n      ~\/\.claude\.json\n    project:\n      \.\/\.claude\n      \.\/\.claude\/settings\.local\.json/
  );

  // Codex block: only user label
  assert.match(output, /✓ Codex\n    user:\n      ~\/\.codex/);
  assert.doesNotMatch(output, /Codex[\s\S]*?project:/);

  // not-detected stays single-line
  assert.match(output, /\n- Cursor     not detected\b/);
  assert.match(output, /\n- skills\.sh  not detected\b/);
});

test("formatDoctor preserves the canonical tool order: claude, codex, cursor, gemini, opencode, skills-sh", () => {
  const output = formatDoctor(emptyResult());
  const expectedOrder = ["Claude", "Codex", "Cursor", "Gemini", "OpenCode", "skills.sh"];
  const indices = expectedOrder.map((name) => output.indexOf(name));
  const sorted = [...indices].sort((a, b) => a - b);
  assert.deepEqual(indices, sorted, "tool rows must appear in canonical order");
});

import { createWarning, type Warning } from "../../src/types.js";

function withWarnings(result: ScanResult, warnings: Warning[]): ScanResult {
  return { ...result, warnings };
}

test("formatDoctor renders warnings grouped by reason with relativized paths", () => {
  let result = emptyResult();
  result = { ...result, homeDir: "/Users/x" };
  result = withWarnings(result, [
    createWarning({
      reason: "sensitive_file_skipped",
      path: "/Users/x/.claude/.env",
      message: "Skipped sensitive file"
    }),
    createWarning({
      reason: "sensitive_file_skipped",
      path: "/Users/x/projects/p/.claude/.env.local",
      message: "Skipped sensitive file"
    }),
    createWarning({
      reason: "parse_failed",
      path: "/Users/x/.codex/config.toml",
      message: "unexpected token"
    })
  ]);

  const output = formatDoctor(result);

  assert.match(output.split("\n")[0], /^Ankui doctor — 0 detected tools, 3 warnings$/);
  assert.match(output, /\nWarnings \(3\)\n────────────\n/);
  assert.match(
    output,
    /sensitive_file_skipped \(2\)\n  ~\/\.claude\/\.env\n  ~\/projects\/p\/\.claude\/\.env\.local/
  );
  assert.match(output, /parse_failed \(1\)\n  ~\/\.codex\/config\.toml/);
  assert.doesNotMatch(output, /No warnings\./);
});

test("formatDoctor falls back to warning.message when path is absent", () => {
  let result = emptyResult();
  result = withWarnings(result, [
    createWarning({
      reason: "adapter_timeout",
      message: "Claude adapter timed out after 1000ms"
    })
  ]);

  const output = formatDoctor(result);
  assert.match(output, /adapter_timeout \(1\)\n  Claude adapter timed out after 1000ms/);
});

test("formatDoctor warning reason groups are sorted by descending count, then alphabetical", () => {
  let result = emptyResult();
  result = withWarnings(result, [
    createWarning({ reason: "parse_failed", path: "/x/1", message: "a" }),
    createWarning({ reason: "symlink_skipped", path: "/x/2", message: "b" }),
    createWarning({ reason: "symlink_skipped", path: "/x/3", message: "c" }),
    createWarning({ reason: "sensitive_file_skipped", path: "/x/4", message: "d" }),
    createWarning({ reason: "sensitive_file_skipped", path: "/x/5", message: "e" }),
    createWarning({ reason: "sensitive_file_skipped", path: "/x/6", message: "f" })
  ]);

  const output = formatDoctor(result);
  const sensitiveIdx = output.indexOf("sensitive_file_skipped (3)");
  const symlinkIdx = output.indexOf("symlink_skipped (2)");
  const parseIdx = output.indexOf("parse_failed (1)");
  assert.ok(
    sensitiveIdx < symlinkIdx && symlinkIdx < parseIdx,
    "groups must sort by descending count"
  );
});

import { formatDoctorJson } from "../../src/utils/format-doctor.js";

test("formatDoctorJson returns metadata + tool rows + warning grouping", () => {
  let result = emptyResult();
  result = { ...result, scannedAt: "2026-05-13T12:00:00.000Z", cwd: "/p", homeDir: "/h" };
  result = withDetectedTool(result, "claude", ["/h/.claude"]);
  result = withWarnings(result, [
    createWarning({ reason: "sensitive_file_skipped", path: "/h/x", message: "" }),
    createWarning({ reason: "sensitive_file_skipped", path: "/h/y", message: "" }),
    createWarning({ reason: "parse_failed", path: "/h/z", message: "boom" })
  ]);

  const json = JSON.parse(formatDoctorJson(result));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.cwd, "/p");
  assert.equal(json.homeDir, "/h");
  assert.equal(json.detectedToolCount, 1);
  assert.equal(json.tools.length, 6);

  const claude = json.tools.find((t: { id: string }) => t.id === "claude");
  assert.equal(claude.detected, true);
  assert.deepEqual(claude.detectedPaths, ["/h/.claude"]);

  const cursor = json.tools.find((t: { id: string }) => t.id === "cursor");
  assert.equal(cursor.detected, false);
  assert.deepEqual(cursor.detectedPaths, []);

  assert.equal(json.warningCount, 3);
  assert.deepEqual(json.warningsByReason, {
    sensitive_file_skipped: 2,
    parse_failed: 1
  });
  assert.equal(json.warnings.length, 3);
});

test("formatDoctorJson omits zero-count reasons from warningsByReason", () => {
  const json = JSON.parse(formatDoctorJson(emptyResult()));
  assert.deepEqual(json.warningsByReason, {});
  assert.equal(json.warningCount, 0);
  assert.deepEqual(json.warnings, []);
});
