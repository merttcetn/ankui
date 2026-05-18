import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { App } from "../../src/tui/App.js";
import type { SessionAction } from "../../src/utils/session-summary.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type MultiProjectScanResult,
  type ScanResult
} from "../../src/types.js";

function emptyResult(): MultiProjectScanResult {
  const tools = createAllEmptyTools();
  const userScope: ScanResult = {
    scannedAt: "2026-05-19T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
  return {
    scannedAt: "2026-05-19T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("App.onExit receives the empty action list when no toggles happened", async () => {
  let captured: ReadonlyArray<SessionAction> | null = null;
  const inst = render(
    <App
      result={emptyResult()}
      onExit={(actions) => {
        captured = [...actions];
      }}
    />
  );
  await flush();
  inst.stdin.write("q");
  await flush();
  inst.unmount();
  assert.ok(captured !== null, "onExit fired");
  assert.deepEqual(captured, []);
});
