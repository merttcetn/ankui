import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { collectWatchPaths, runWatchCommand } from "../../src/commands/watch.js";
import type { MultiProjectScanResult } from "../../src/types.js";

function emptyResult(homeDir: string): MultiProjectScanResult {
  return {
    scannedAt: new Date().toISOString(),
    cwd: homeDir,
    homeDir,
    devRoots: [],
    userScope: {
      scannedAt: new Date().toISOString(),
      cwd: homeDir,
      homeDir,
      tools: [],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 0,
        totalSkills: 0,
        totalMcpServers: 0,
        uniqueMcpServers: 0,
        customCommands: 0,
        customTools: 0,
        plugins: 0,
        memoryFiles: 0,
        agentSkills: 0,
        skillsShSkills: 0,
        totalFindings: 0,
        broadAccessFindings: 0
      }
    },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

async function makeHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-watch-home-"));
}

test("collectWatchPaths includes every existing user-scope tool dir", async () => {
  const home = await makeHome();
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await fs.mkdir(path.join(home, ".codex"), { recursive: true });
  await fs.mkdir(path.join(home, ".cursor"), { recursive: true });
  await fs.mkdir(path.join(home, ".gemini"), { recursive: true });
  await fs.mkdir(path.join(home, ".config", "opencode"), { recursive: true });
  await fs.mkdir(path.join(home, ".antigravity"), { recursive: true });
  await fs.mkdir(path.join(home, ".skills"), { recursive: true });
  await fs.mkdir(path.join(home, ".config", "skills"), { recursive: true });
  await fs.writeFile(path.join(home, ".claude.json"), "{}");

  const paths = await collectWatchPaths({ homeDir: home, devRoots: [] });
  for (const expected of [
    path.join(home, ".claude"),
    path.join(home, ".claude.json"),
    path.join(home, ".codex"),
    path.join(home, ".cursor"),
    path.join(home, ".gemini"),
    path.join(home, ".config", "opencode"),
    path.join(home, ".antigravity"),
    path.join(home, ".skills"),
    path.join(home, ".config", "skills")
  ]) {
    assert.ok(paths.includes(expected), `expected ${expected} in watch list`);
  }

  await fs.rm(home, { recursive: true, force: true });
});

test("collectWatchPaths skips user-scope paths that do not exist", async () => {
  const home = await makeHome();
  // Only create .claude.
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  const paths = await collectWatchPaths({ homeDir: home, devRoots: [] });
  assert.ok(paths.includes(path.join(home, ".claude")));
  assert.ok(!paths.includes(path.join(home, ".codex")));
  assert.ok(!paths.includes(path.join(home, ".cursor")));
  await fs.rm(home, { recursive: true, force: true });
});

test("collectWatchPaths includes each AI-marked project under a dev root", async () => {
  const home = await makeHome();
  const devRoot = path.join(home, "Developer");
  await fs.mkdir(devRoot, { recursive: true });

  // Project A has .claude/ — marker.
  await fs.mkdir(path.join(devRoot, "alpha", ".claude"), { recursive: true });
  // Project B has CLAUDE.md — marker.
  await fs.mkdir(path.join(devRoot, "beta"), { recursive: true });
  await fs.writeFile(path.join(devRoot, "beta", "CLAUDE.md"), "");
  // Non-project dir — no markers.
  await fs.mkdir(path.join(devRoot, "gamma"), { recursive: true });

  const paths = await collectWatchPaths({ homeDir: home, devRoots: [devRoot] });
  assert.ok(paths.includes(path.join(devRoot, "alpha")));
  assert.ok(paths.includes(path.join(devRoot, "beta")));
  assert.ok(!paths.includes(path.join(devRoot, "gamma")));

  await fs.rm(home, { recursive: true, force: true });
});

test("collectWatchPaths excludes obviously sensitive directories", async () => {
  const home = await makeHome();
  await fs.mkdir(path.join(home, ".codex", "sessions"), { recursive: true });
  const paths = await collectWatchPaths({ homeDir: home, devRoots: [] });
  // .codex itself is fine; sessions subdir would have been ignored by the watcher,
  // but we should never explicitly add a sensitive-named directory to the watch list.
  for (const p of paths) {
    assert.ok(!p.endsWith("/sessions"), `sensitive dir snuck in: ${p}`);
    assert.ok(!p.includes("/sessions/"), `sensitive subpath snuck in: ${p}`);
  }
  await fs.rm(home, { recursive: true, force: true });
});

test("collectWatchPaths returns absolute paths only", async () => {
  const home = await makeHome();
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  const paths = await collectWatchPaths({ homeDir: home, devRoots: [] });
  for (const p of paths) {
    assert.ok(path.isAbsolute(p), `non-absolute path: ${p}`);
  }
  await fs.rm(home, { recursive: true, force: true });
});

test("runWatchCommand rescans on file change and pushes via subscription", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-watch-run-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await fs.writeFile(path.join(home, ".claude", "CLAUDE.md"), "v1");

  let scanCount = 0;
  const loadAllScansStub = async (): Promise<MultiProjectScanResult> => {
    scanCount += 1;
    return emptyResult(home);
  };
  const pushed: MultiProjectScanResult[] = [];

  const handle = await runWatchCommand({
    homeDir: home,
    env: {},
    devRoots: [],
    debounceMs: 80,
    __loadAllScansForTesting: loadAllScansStub,
    __mountTui: async (dataSource) => {
      pushed.push(dataSource.initial);
      const unsubscribe = dataSource.subscribe!((next) => {
        pushed.push(next);
      });
      return {
        async waitUntilExit() {
          await new Promise((resolve) => setTimeout(resolve, 500));
        },
        unsubscribe
      };
    }
  });

  // Trigger a real fs event after the watcher is ready.
  await new Promise((r) => setTimeout(r, 200));
  await fs.writeFile(path.join(home, ".claude", "CLAUDE.md"), "v2");
  await handle.exitPromise;
  await handle.shutdown();

  assert.ok(scanCount >= 2, `expected initial + 1 rescan, got ${scanCount}`);
  assert.ok(pushed.length >= 2, `expected initial + 1 push, got ${pushed.length}`);
  await fs.rm(home, { recursive: true, force: true });
});

test("runWatchCommand never invokes loadAllScans for a sensitive change", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-watch-run-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  // Pre-create a sensitive file before the watcher starts so chokidar already
  // knows about it. The watcher's ignored predicate should block events for it.
  const sensitive = path.join(home, ".claude", "session.json");
  await fs.writeFile(sensitive, "{}");

  let scanCount = 0;
  const loadAllScansStub = async (): Promise<MultiProjectScanResult> => {
    scanCount += 1;
    return emptyResult(home);
  };

  const handle = await runWatchCommand({
    homeDir: home,
    env: {},
    devRoots: [],
    debounceMs: 80,
    __loadAllScansForTesting: loadAllScansStub,
    __mountTui: async () => ({
      async waitUntilExit() {
        await new Promise((resolve) => setTimeout(resolve, 400));
      },
      unsubscribe: () => {}
    })
  });

  await new Promise((r) => setTimeout(r, 150));
  const initialCount = scanCount;
  await fs.writeFile(sensitive, '{"changed":true}');
  await handle.exitPromise;
  await handle.shutdown();

  assert.equal(
    scanCount,
    initialCount,
    `expected no rescan for sensitive change; before=${initialCount} after=${scanCount}`
  );
  await fs.rm(home, { recursive: true, force: true });
});

test("runWatchCommand survives a scan failure and continues watching", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-watch-run-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await fs.writeFile(path.join(home, ".claude", "CLAUDE.md"), "v1");

  let scanCount = 0;
  let failNext = false;
  const loadAllScansStub = async (): Promise<MultiProjectScanResult> => {
    scanCount += 1;
    if (failNext) {
      failNext = false;
      throw new Error("synthetic scan failure");
    }
    return emptyResult(home);
  };

  const handle = await runWatchCommand({
    homeDir: home,
    env: {},
    devRoots: [],
    debounceMs: 80,
    __loadAllScansForTesting: loadAllScansStub,
    __mountTui: async () => ({
      async waitUntilExit() {
        await new Promise((resolve) => setTimeout(resolve, 700));
      },
      unsubscribe: () => {}
    })
  });

  await new Promise((r) => setTimeout(r, 150));
  failNext = true;
  await fs.writeFile(path.join(home, ".claude", "CLAUDE.md"), "v2");
  await new Promise((r) => setTimeout(r, 300));
  await fs.writeFile(path.join(home, ".claude", "CLAUDE.md"), "v3");
  await handle.exitPromise;
  await handle.shutdown();

  assert.ok(scanCount >= 3, `expected initial + 2 rescans (one failed), got ${scanCount}`);
  await fs.rm(home, { recursive: true, force: true });
});
