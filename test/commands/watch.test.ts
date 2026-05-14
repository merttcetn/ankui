import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { collectWatchPaths } from "../../src/commands/watch.js";

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
