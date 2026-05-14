import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { Settings } from "../../../src/tui/screens/Settings.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type MultiProjectScanResult
} from "../../../src/types.js";

function multiProjectFixture(opts: {
  devRoots?: string[];
  scannedAt?: string;
  totalSkills?: number;
} = {}): MultiProjectScanResult {
  const tools = createAllEmptyTools();
  const summary = createScanSummary(tools);
  return {
    scannedAt: opts.scannedAt ?? "2026-05-14T00:42:00.000Z",
    cwd: "/h",
    homeDir: "/h",
    devRoots: opts.devRoots ?? [
      "/h/Developer/Ceto's Projects",
      "/h/Developer/personal"
    ],
    userScope: {
      scannedAt: opts.scannedAt ?? "2026-05-14T00:42:00.000Z",
      cwd: "/h",
      homeDir: "/h",
      tools,
      findings: [],
      warnings: [],
      summary
    },
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: opts.totalSkills ?? 273
    }
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("Settings renders DEV ROOTS and SCAN HISTORY section headers", () => {
  const inst = render(
    <Settings
      result={multiProjectFixture()}
      onConfigChange={async () => {}}
      onRescan={() => {}}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /D E V   R O O T S/);
  assert.match(frame, /S C A N   H I S T O R Y/);
  inst.unmount();
});

test("Settings lists each registered dev root home-relative", () => {
  const inst = render(
    <Settings
      result={multiProjectFixture()}
      onConfigChange={async () => {}}
      onRescan={() => {}}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /~\/Developer\/Ceto/);
  assert.match(frame, /~\/Developer\/personal/);
  inst.unmount();
});

test("Settings shows the last-scan timestamp and skill count", () => {
  const inst = render(
    <Settings
      result={multiProjectFixture({
        scannedAt: "2026-05-14T00:42:13.000Z",
        totalSkills: 273
      })}
      onConfigChange={async () => {}}
      onRescan={() => {}}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /last scan/);
  assert.match(frame, /273 skills/);
  inst.unmount();
});

test("Settings calls onConfigChange when 'd' is pressed on a selected row", async () => {
  let received: string[] | undefined;
  const inst = render(
    <Settings
      result={multiProjectFixture()}
      onConfigChange={async (roots) => { received = roots; }}
      onRescan={() => {}}
    />
  );
  await flush();
  // Cursor starts at 0 (first dev root). Press 'd' to delete it.
  inst.stdin.write("d");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(received, ["/h/Developer/personal"]);
  inst.unmount();
});

test("Settings calls onRescan when 'r' is pressed", async () => {
  let triggered = false;
  const inst = render(
    <Settings
      result={multiProjectFixture()}
      onConfigChange={async () => {}}
      onRescan={() => { triggered = true; }}
    />
  );
  await flush();
  inst.stdin.write("r");
  await flush();
  assert.equal(triggered, true);
  inst.unmount();
});

test("Settings enters add-mode when 'a' is pressed and confirms with Enter", async () => {
  let received: string[] | undefined;
  const inst = render(
    <Settings
      result={multiProjectFixture()}
      onConfigChange={async (roots) => { received = roots; }}
      onRescan={() => {}}
    />
  );
  await flush();
  // Enter add mode.
  inst.stdin.write("a");
  await flush();
  // Type a path.
  inst.stdin.write("/h/code");
  await flush();
  // Submit.
  inst.stdin.write("\r");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(received, [
    "/h/Developer/Ceto's Projects",
    "/h/Developer/personal",
    "/h/code"
  ]);
  inst.unmount();
});

test("Settings shows an empty-state line when there are no dev roots", () => {
  const inst = render(
    <Settings
      result={multiProjectFixture({ devRoots: [] })}
      onConfigChange={async () => {}}
      onRescan={() => {}}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /No dev roots registered/);
  inst.unmount();
});
