import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { FirstRunScan } from "../../../src/tui/screens/FirstRunScan.js";
import type {
  CrawlOptions,
  CrawlResult,
  FoundProject
} from "../../../src/scanner/filesystem-crawler.js";

function makeStubCrawler(input: {
  projects: FoundProject[];
  pathsVisited?: number;
  durationMs?: number;
  emitDuringCall?: boolean;
}): (opts: CrawlOptions) => Promise<CrawlResult> {
  return async (opts) => {
    if (input.emitDuringCall) {
      for (const project of input.projects) {
        opts.onProject?.(project);
        await new Promise<void>((r) => setImmediate(r));
      }
    }
    return {
      projects: input.projects,
      warnings: [],
      stats: {
        pathsVisited: input.pathsVisited ?? 100,
        durationMs: input.durationMs ?? 50
      }
    };
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const SAMPLE_PROJECTS: FoundProject[] = [
  { projectPath: "/h/Developer/a", parentPath: "/h/Developer", markers: [".claude"], depth: 2 },
  { projectPath: "/h/Developer/b", parentPath: "/h/Developer", markers: [".claude"], depth: 2 },
  { projectPath: "/h/Developer/c", parentPath: "/h/Developer", markers: [".codex"], depth: 2 },
  { projectPath: "/h/work/x",      parentPath: "/h/work",      markers: ["CLAUDE.md"], depth: 2 }
];

test("FirstRunScan renders the splash logo and tagline while crawling", () => {
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={() => {}}
      onCancel={() => {}}
      crawlImpl={() => new Promise(() => {})} // never resolves
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /ankui/);
  assert.match(frame, /anghkooey/);
  assert.match(frame, /remember what your agents can access/);
  // Spinner glyph from SPINNER_FRAMES is visible.
  assert.match(frame, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  inst.unmount();
});

test("FirstRunScan transitions to selecting phase with default-on roots checked", async () => {
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={() => {}}
      onCancel={() => {}}
      crawlImpl={makeStubCrawler({ projects: SAMPLE_PROJECTS, pathsVisited: 12345 })}
    />
  );
  // Crawler resolves on next tick; let microtasks flush. Under heavy
  // concurrent test load (full `npm test` run), 20ms is occasionally too
  // tight — give the React effect chain more room.
  await new Promise((r) => setTimeout(r, 100));
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /F O U N D   D E V   R O O T S/);
  // Developer parent has 3 projects → default-ON → "●"
  assert.match(frame, /●.*Developer/);
  // work parent has 1 project → default-OFF → "○"
  assert.match(frame, /○.*work/);
  inst.unmount();
});

test("FirstRunScan shows live 'N paths · M projects' counters during crawl", async () => {
  let resolveCrawl: ((value: CrawlResult) => void) | undefined;
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={() => {}}
      onCancel={() => {}}
      crawlImpl={(opts) =>
        new Promise<CrawlResult>((resolve) => {
          resolveCrawl = resolve;
          // Emit two projects mid-crawl.
          opts.onProject?.(SAMPLE_PROJECTS[0]!);
          opts.onProject?.(SAMPLE_PROJECTS[1]!);
        })
      }
    />
  );
  await new Promise((r) => setTimeout(r, 100));
  const frame = inst.lastFrame() ?? "";
  // Two projects already counted, even though crawl hasn't resolved.
  assert.match(frame, /2 projects found/);
  // Resolve so the test can unmount cleanly.
  resolveCrawl?.({
    projects: SAMPLE_PROJECTS.slice(0, 2),
    warnings: [],
    stats: { pathsVisited: 200, durationMs: 30 }
  });
  await new Promise((r) => setTimeout(r, 50));
  inst.unmount();
});

test("FirstRunScan toggles selection with space and confirms with enter", async () => {
  let confirmed: string[] | undefined;
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={(roots) => { confirmed = roots; }}
      onCancel={() => {}}
      crawlImpl={makeStubCrawler({ projects: SAMPLE_PROJECTS })}
    />
  );
  await new Promise((r) => setTimeout(r, 100));
  // Press space on the first (Developer, default-on) row to toggle OFF.
  inst.stdin.write(" ");
  await flush();
  // Press down arrow to move to second row (work).
  inst.stdin.write("\x1B[B");
  await flush();
  // Toggle ON.
  inst.stdin.write(" ");
  await flush();
  // Confirm.
  inst.stdin.write("\r");
  await flush();
  assert.deepEqual(confirmed, ["/h/work"]);
  inst.unmount();
});

test("FirstRunScan calls onCancel when Esc is pressed during crawl", async () => {
  let cancelled = false;
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={() => {}}
      onCancel={() => { cancelled = true; }}
      crawlImpl={() => new Promise(() => {})}
    />
  );
  await flush();
  inst.stdin.write("\x1B"); // Esc
  await flush();
  assert.equal(cancelled, true);
  inst.unmount();
});

test("FirstRunScan shows 'No projects found.' when crawl finds zero", async () => {
  const inst = render(
    <FirstRunScan
      mode="firstRun"
      homeDir="/h"
      onConfirm={() => {}}
      onCancel={() => {}}
      crawlImpl={makeStubCrawler({ projects: [] })}
    />
  );
  await new Promise((r) => setTimeout(r, 100));
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /No projects found/);
  inst.unmount();
});
