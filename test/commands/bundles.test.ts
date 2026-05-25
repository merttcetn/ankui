import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runBundlesCommand } from "../../src/commands/bundles.js";
import { writeRegistry } from "../../src/bundles/registry.js";

async function tmpHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-bl-"));
}

test("ankui bundles prints one line per registered bundle", async () => {
  const home = await tmpHome();
  await writeRegistry(home, {
    version: 1,
    bundles: [
      {
        name: "foo/skills",
        url: "https://github.com/foo/skills",
        pinnedSha: "a".repeat(40),
        pinnedCommitMessage: "x",
        installedAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        scope: "user",
        installs: [
          { toolId: "claude", skillName: "autoplan", bundlePath: "x", symlinkPath: "y" },
          { toolId: "skills-sh", skillName: "autoplan", bundlePath: "x", symlinkPath: "z" }
        ]
      }
    ]
  });
  const r = await runBundlesCommand({ homeDir: home, flags: {} });
  assert.equal(r.exitCode, 0);
  const out = r.stdout.join("\n");
  assert.match(out, /foo\/skills/);
  assert.match(out, /aaaaaaa/);
  assert.match(out, /1 skills × 2 tools/);
  assert.match(out, /user/);
});

test("ankui bundles --json emits the registry sanitized as JSON", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const r = await runBundlesCommand({ homeDir: home, flags: { json: true } });
  const parsed = JSON.parse(r.stdout.join(""));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.bundles, []);
});

test("ankui bundles with empty registry prints a friendly empty message", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const r = await runBundlesCommand({ homeDir: home, flags: {} });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout.join("\n"), /no bundles/i);
});
