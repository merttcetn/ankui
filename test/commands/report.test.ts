import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runReportCommand } from "../../src/commands/report.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type ScanResult
} from "../../src/types.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

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

test("runReportCommand prints a sanitized Markdown report to stdout", async () => {
  const home = await makeTempWorkspace("ankui-report-home-");
  let captured = "";

  await runReportCommand({
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    devRoots: [],
    now: new Date("2026-07-05T10:00:00.000Z"),
    env: {},
    __scanForTesting: async (opts) => emptyScan(opts.cwd ?? home, opts.homeDir ?? home)
  });

  assert.match(captured, /^# Ankui Sanitized Report\n/);
  assert.match(captured, /Privacy: strict/);
  assert.doesNotMatch(captured, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("runReportCommand emits sanitized report model JSON when json is true", async () => {
  const home = await makeTempWorkspace("ankui-report-json-home-");
  let captured = "";

  await runReportCommand({
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    devRoots: [],
    now: new Date("2026-07-05T10:00:00.000Z"),
    env: {},
    __scanForTesting: async (opts) => emptyScan(opts.cwd ?? home, opts.homeDir ?? home)
  });

  const parsed = JSON.parse(captured);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.privacy, "strict");
  assert.equal(parsed.generatedAt, "2026-07-05T10:00:00.000Z");
  assert.ok(!("homeDir" in parsed));
  assert.ok(!("devRoots" in parsed));
});

test("runReportCommand writes --output only when the target file is new", async () => {
  const home = await makeTempWorkspace("ankui-report-output-home-");
  const output = path.join(home, "report.md");
  let captured = "";

  await runReportCommand({
    json: false,
    output,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    devRoots: [],
    now: new Date("2026-07-05T10:00:00.000Z"),
    env: {},
    __scanForTesting: async (opts) => emptyScan(opts.cwd ?? home, opts.homeDir ?? home)
  });

  const written = await fs.readFile(output, "utf8");
  assert.match(written, /^# Ankui Sanitized Report\n/);
  assert.match(captured, /Wrote sanitized report/);

  await assert.rejects(
    () =>
      runReportCommand({
        json: false,
        output,
        write: () => {},
        homeDir: home,
        devRoots: [],
        env: {},
        __scanForTesting: async (opts) => emptyScan(opts.cwd ?? home, opts.homeDir ?? home)
      }),
    /output file already exists/
  );
});

test("runReportCommand fails cleanly when --output parent is missing", async () => {
  const home = await makeTempWorkspace("ankui-report-missing-parent-home-");
  const output = path.join(home, "missing", "report.md");

  await assert.rejects(
    () =>
      runReportCommand({
        json: false,
        output,
        write: () => {},
        homeDir: home,
        devRoots: [],
        env: {},
        __scanForTesting: async (opts) => emptyScan(opts.cwd ?? home, opts.homeDir ?? home)
      }),
    /output parent directory does not exist/
  );
});
