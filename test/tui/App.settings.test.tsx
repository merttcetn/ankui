import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { App } from "../../src/tui/App.js";
import {
  createAllEmptyTools,
  createScanSummary,
  type MultiProjectScanResult
} from "../../src/types.js";

function fixture(): MultiProjectScanResult {
  const tools = createAllEmptyTools();
  const summary = createScanSummary(tools);
  return {
    scannedAt: "2026-05-14T00:42:00.000Z",
    cwd: "/h",
    homeDir: "/h",
    devRoots: ["/h/Developer/Ceto's Projects"],
    userScope: {
      scannedAt: "2026-05-14T00:42:00.000Z",
      cwd: "/h",
      homeDir: "/h",
      tools,
      findings: [],
      warnings: [],
      summary
    },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 273 }
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function pressTabs(stdin: { write: (s: string) => void }, count: number): Promise<void> {
  await flush();
  for (let i = 0; i < count; i += 1) {
    stdin.write("\t");
    await flush();
  }
}

test("App registers a Settings tab in the cross-tool row", () => {
  const inst = render(
    <App mode="main" result={fixture()} homeDir="/h" onConfigChange={async () => {}} />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Settings/);
  inst.unmount();
});

test("App routes activeTab='settings' to the Settings screen", async () => {
  const inst = render(
    <App mode="main" result={fixture()} homeDir="/h" onConfigChange={async () => {}} />
  );
  // Tools row: overview + 6 tools = 7. Cross-tool row: mcps, access, doctor, settings.
  // Tab 10 times to land on Settings.
  await pressTabs(inst.stdin, 10);
  const frame = inst.lastFrame() ?? "";
  // The TabBar renders the active tab uppercased without inter-letter spacing,
  // so look for the uppercased "SETTINGS" in the tab row.
  assert.match(frame, /SETTINGS/);
  // DEV ROOTS header is in the Settings screen body (SectionHeader spaces letters).
  assert.match(frame, /D E V   R O O T S/);
  inst.unmount();
});

test("App preserves Overview routing after Settings tab integration", () => {
  const inst = render(
    <App mode="main" result={fixture()} homeDir="/h" onConfigChange={async () => {}} />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /OVERVIEW/);
  inst.unmount();
});
