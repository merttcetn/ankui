import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readRegistry, writeRegistry, withRegistryLock, type BundleEntry } from "../../src/bundles/registry.js";

async function tmpHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-reg-"));
}

test("readRegistry returns empty when registry.json is missing", async () => {
  const home = await tmpHome();
  const r = await readRegistry(home);
  assert.deepEqual(r, { version: 1, bundles: [] });
});

test("writeRegistry creates ~/.ankui/bundles/registry.json atomically", async () => {
  const home = await tmpHome();
  const entry: BundleEntry = {
    name: "foo/skills",
    url: "https://github.com/foo/skills",
    pinnedSha: "a".repeat(40),
    pinnedCommitMessage: "Initial",
    installedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    scope: "user",
    installs: []
  };
  await writeRegistry(home, { version: 1, bundles: [entry] });
  const raw = await fs.readFile(path.join(home, ".ankui", "bundles", "registry.json"), "utf8");
  assert.match(raw, /"name": "foo\/skills"/);
  const re = await readRegistry(home);
  assert.equal(re.bundles[0].pinnedSha, "a".repeat(40));
});

test("withRegistryLock serializes concurrent updates", async () => {
  const home = await tmpHome();
  let inFlight = 0;
  let maxInFlight = 0;
  const ops = Array.from({ length: 4 }, () =>
    withRegistryLock(home, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    })
  );
  await Promise.all(ops);
  assert.equal(maxInFlight, 1, "registry lock must serialize");
});
