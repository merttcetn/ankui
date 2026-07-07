import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDiffCommand } from "../../src/commands/diff.js";
import {
  runSnapshotCreateCommand,
  runSnapshotDeleteCommand,
  runSnapshotListCommand
} from "../../src/commands/snapshot.js";
import { createAllEmptyTools, createScanSummary, type ScanResult } from "../../src/types.js";

function emptyScan(cwd: string, homeDir: string, stamp: string): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: stamp,
    cwd,
    homeDir,
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

test("snapshot commands create, list, diff, and delete a baseline", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-snapshot-command-"));
  let output = "";
  const scanAt = "2026-07-06T10:00:00.000Z";
  const scanImpl = async (options: { cwd?: string; homeDir?: string }): Promise<ScanResult> =>
    emptyScan(options.cwd ?? home, options.homeDir ?? home, scanAt);

  const createCode = await runSnapshotCreateCommand({
    json: true,
    label: "baseline",
    homeDir: home,
    devRoots: [],
    now: new Date(scanAt),
    env: {},
    write: (chunk) => { output += chunk; },
    __scanForTesting: scanImpl
  });
  assert.equal(createCode, 0);
  const created = JSON.parse(output);
  assert.equal(created.snapshot.label, "baseline");
  const id = created.snapshot.id as string;

  output = "";
  assert.equal(await runSnapshotListCommand({
    json: false,
    homeDir: home,
    write: (chunk) => { output += chunk; }
  }), 0);
  assert.match(output, /baseline/);

  output = "";
  assert.equal(await runDiffCommand({
    json: true,
    homeDir: home,
    devRoots: [],
    now: new Date(scanAt),
    env: {},
    write: (chunk) => { output += chunk; },
    __scanForTesting: scanImpl
  }), 0);
  assert.equal(JSON.parse(output).summary.total, 0);

  assert.equal(await runSnapshotDeleteCommand({
    id,
    yes: false,
    json: false,
    homeDir: home,
    write: () => {}
  }), 1);
  assert.equal(await runSnapshotDeleteCommand({
    id,
    yes: true,
    json: true,
    homeDir: home,
    write: () => {}
  }), 0);
});

test("diff fails cleanly when no baseline exists", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-diff-empty-"));
  let error = "";
  const code = await runDiffCommand({
    json: false,
    homeDir: home,
    write: () => {},
    writeError: (chunk) => { error += chunk; }
  });
  assert.equal(code, 1);
  assert.match(error, /no snapshots found/);
});
