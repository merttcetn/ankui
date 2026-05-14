import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { App } from "../../src/tui/App.js";
import type {
  CrawlOptions,
  CrawlResult,
  FoundProject
} from "../../src/scanner/filesystem-crawler.js";

const SAMPLE_PROJECTS: FoundProject[] = [
  { projectPath: "/h/Developer/a", parentPath: "/h/Developer", markers: [".claude"], depth: 2 },
  { projectPath: "/h/Developer/b", parentPath: "/h/Developer", markers: [".claude"], depth: 2 },
  { projectPath: "/h/Developer/c", parentPath: "/h/Developer", markers: [".codex"], depth: 2 }
];

function stubCrawl(_opts: CrawlOptions): Promise<CrawlResult> {
  return Promise.resolve({
    projects: SAMPLE_PROJECTS,
    warnings: [],
    stats: { pathsVisited: 100, durationMs: 10 }
  });
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("App in mode='firstRun' renders FirstRunScan and does not render tab bar", async () => {
  const inst = render(
    <App
      mode="firstRun"
      result={null}
      homeDir="/h"
      onConfigChange={async () => {}}
      crawlImplForFirstRun={stubCrawl}
    />
  );
  await new Promise((r) => setTimeout(r, 30));
  const frame = inst.lastFrame() ?? "";
  // Splash visible.
  assert.match(frame, /ankui/);
  assert.match(frame, /anghkooey/);
  // Tab bar absent (no "Overview" tab label in main-mode case).
  assert.doesNotMatch(frame, /Overview/);
  inst.unmount();
});

test("App in firstRun mode triggers onConfigChange with selected roots on Enter", async () => {
  let saved: string[] | undefined;
  const inst = render(
    <App
      mode="firstRun"
      result={null}
      homeDir="/h"
      onConfigChange={async (roots) => { saved = roots; }}
      crawlImplForFirstRun={stubCrawl}
    />
  );
  await new Promise((r) => setTimeout(r, 30));
  await flush();
  inst.stdin.write("\r"); // confirm default selection
  await flush();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(saved, ["/h/Developer"]);
  inst.unmount();
});
