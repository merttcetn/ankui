import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createWatcher } from "../../src/scanner/watcher.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-watcher-"));
}

async function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("watcher invokes onChange when a watched file is modified", async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, "config.json");
  await fs.writeFile(file, "{}");

  const events: string[] = [];
  const watcher = createWatcher({
    paths: [dir],
    onChange: (eventPath) => {
      events.push(eventPath);
    },
    isIgnored: () => false,
    debounceMs: 50
  });
  await watcher.start();
  // chokidar emits an initial "add" for existing files; flush those.
  await settle(150);
  events.length = 0;

  await fs.writeFile(file, '{"changed": true}');
  await settle(250);

  assert.ok(events.length >= 1, `expected at least one event, got ${events.length}`);
  assert.ok(events.some((p) => p === file), `expected event for ${file}, got ${events.join(", ")}`);

  await watcher.stop();
  await fs.rm(dir, { recursive: true, force: true });
});

test("watcher debounces rapid writes via stabilityThreshold", async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, "burst.json");

  const events: string[] = [];
  const watcher = createWatcher({
    paths: [dir],
    onChange: (eventPath) => {
      events.push(eventPath);
    },
    isIgnored: () => false,
    debounceMs: 150
  });
  await watcher.start();
  await settle(100);
  events.length = 0;

  // Editor-save burst: 5 writes within ~50ms.
  for (let i = 0; i < 5; i++) {
    await fs.writeFile(file, `{"n":${i}}`);
    await settle(10);
  }
  // Wait for debounce to settle.
  await settle(400);

  // We expect a single coalesced event (chokidar's awaitWriteFinish), not 5.
  assert.ok(events.length <= 2, `expected <= 2 coalesced events, got ${events.length}: ${events.join(", ")}`);
  assert.ok(events.length >= 1, "expected at least one event after burst");

  await watcher.stop();
  await fs.rm(dir, { recursive: true, force: true });
});

test("watcher filters events through isIgnored", async () => {
  const dir = await makeTempDir();
  const ignored = path.join(dir, "session.json");
  const allowed = path.join(dir, "ok.json");
  await fs.writeFile(ignored, "{}");
  await fs.writeFile(allowed, "{}");

  const events: string[] = [];
  const watcher = createWatcher({
    paths: [dir],
    onChange: (eventPath) => {
      events.push(eventPath);
    },
    isIgnored: (p) => p.endsWith("session.json"),
    debounceMs: 50
  });
  await watcher.start();
  await settle(150);
  events.length = 0;

  await fs.writeFile(ignored, '{"changed":1}');
  await fs.writeFile(allowed, '{"changed":1}');
  await settle(250);

  assert.ok(
    events.every((p) => !p.endsWith("session.json")),
    `ignored path should not appear in events: ${events.join(", ")}`
  );
  assert.ok(
    events.some((p) => p.endsWith("ok.json")),
    `allowed path should appear in events: ${events.join(", ")}`
  );

  await watcher.stop();
  await fs.rm(dir, { recursive: true, force: true });
});

test("watcher.stop() prevents further callbacks", async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, "x.json");
  await fs.writeFile(file, "{}");

  let count = 0;
  const watcher = createWatcher({
    paths: [dir],
    onChange: () => {
      count += 1;
    },
    isIgnored: () => false,
    debounceMs: 50
  });
  await watcher.start();
  await settle(100);
  await watcher.stop();
  count = 0;

  await fs.writeFile(file, '{"after":true}');
  await settle(250);
  assert.equal(count, 0, "no events should fire after stop()");

  await fs.rm(dir, { recursive: true, force: true });
});

test("watcher is idempotent — double-stop is safe", async () => {
  const dir = await makeTempDir();
  const watcher = createWatcher({
    paths: [dir],
    onChange: () => {},
    isIgnored: () => false,
    debounceMs: 50
  });
  await watcher.start();
  await watcher.stop();
  await watcher.stop(); // must not throw
  await fs.rm(dir, { recursive: true, force: true });
});

test("watcher gracefully handles a missing watched path", async () => {
  const ghost = path.join(os.tmpdir(), `ankui-watcher-ghost-${Date.now()}`);
  const watcher = createWatcher({
    paths: [ghost],
    onChange: () => {},
    isIgnored: () => false,
    debounceMs: 50
  });
  // chokidar v4 swallows ENOENT for non-existent paths — we just want no throw.
  await watcher.start();
  await watcher.stop();
});
