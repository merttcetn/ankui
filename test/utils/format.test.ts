import assert from "node:assert/strict";
import test from "node:test";

import { formatScanSummary } from "../../src/utils/format.js";
import { stripAnsi } from "../../src/utils/format-ui.js";
import { createAllEmptyTools, createScanSummary, type ScanResult } from "../../src/types.js";

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

test("formatScanSummary renders the compact table contract without color by default", () => {
  const output = formatScanSummary(emptyResult());

  assert.match(output, /^Ankui Scan\n/);
  assert.match(output, /Status\s+complete/);
  assert.match(output, /Detected\s+0 tools/);
  assert.match(output, /Tools\n─────\n/);
  assert.match(output, /Tool\s+Details/);
  assert.doesNotMatch(output, /\u001b\[[0-9;]*m/);
});

test("formatScanSummary can render ANSI color and strip back to the plain contract", () => {
  const colored = formatScanSummary(emptyResult(), { color: true });

  assert.match(colored, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(colored), /^Ankui Scan\n/);
  assert.match(stripAnsi(colored), /Detected\s+0 tools/);
});

