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

async function pressDownArrows(stdin: { write: (s: string) => void }, count: number): Promise<void> {
  await flush();
  for (let i = 0; i < count; i += 1) {
    stdin.write("\x1B[B");
    await flush();
  }
}

test("App registers a Settings tab in the Sidebar VIEWS section", () => {
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
  // From sidebar focus on `overview`, ↓ cycles through the flattened tab list:
  // TOOLS section (overview + 7 tools = 8) + VIEWS section (mcps, access,
  // doctor, actions, bundles, settings). 13 down arrows land on `settings`.
  await pressDownArrows(inst.stdin, 13);
  const frame = inst.lastFrame() ?? "";
  // The Sidebar renders the active row uppercased with a ▶ prefix when focus
  // is on the sidebar. Look for the active-sidebar variant.
  assert.match(frame, /▶ SETTINGS/);
  // DEV ROOTS header is in the Settings screen body (SectionHeader spaces letters).
  assert.match(frame, /D E V   R O O T S/);
  inst.unmount();
});

test("App preserves Overview routing after Settings tab integration", () => {
  const inst = render(
    <App mode="main" result={fixture()} homeDir="/h" onConfigChange={async () => {}} />
  );
  const frame = inst.lastFrame() ?? "";
  // Initial state has sidebar focus on Overview, so the active row reads
  // "▶ OVERVIEW" in the sidebar.
  assert.match(frame, /OVERVIEW/);
  inst.unmount();
});
