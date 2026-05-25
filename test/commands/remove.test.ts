import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runRemoveCommand } from "../../src/commands/remove.js";
import { readRegistry, writeRegistry } from "../../src/bundles/registry.js";

async function seedBundle(home: string): Promise<{ bundleDir: string; symlinkPath: string }> {
  const bundleDir = path.join(home, ".ankui", "bundles", "foo", "skills");
  const sourceMd = path.join(bundleDir, "autoplan", "SKILL.md");
  await fs.mkdir(path.dirname(sourceMd), { recursive: true });
  await fs.writeFile(sourceMd, "x");
  const symlinkPath = path.join(home, ".claude", "skills", "autoplan", "SKILL.md");
  await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
  await fs.symlink(sourceMd, symlinkPath);
  await writeRegistry(home, {
    version: 1,
    bundles: [{
      name: "foo/skills",
      url: "https://github.com/foo/skills",
      pinnedSha: "a".repeat(40),
      pinnedCommitMessage: "x",
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user",
      installs: [{ toolId: "claude", skillName: "autoplan", bundlePath: sourceMd, symlinkPath }]
    }]
  });
  return { bundleDir, symlinkPath };
}

test("ankui remove deletes symlinks, the cloned dir, and the registry entry", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-rm-"));
  const { bundleDir, symlinkPath } = await seedBundle(home);
  const r = await runRemoveCommand({ name: "foo/skills", flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  await assert.rejects(() => fs.lstat(symlinkPath), /ENOENT/);
  await assert.rejects(() => fs.lstat(bundleDir), /ENOENT/);
  const reg = await readRegistry(home);
  assert.equal(reg.bundles.length, 0);
});

test("ankui remove tolerates a manually deleted symlink", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-rm-"));
  const { symlinkPath } = await seedBundle(home);
  await fs.unlink(symlinkPath);
  const r = await runRemoveCommand({ name: "foo/skills", flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
});

test("ankui remove warns when a symlink was replaced by a regular file (and leaves it)", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-rm-"));
  const { symlinkPath } = await seedBundle(home);
  await fs.unlink(symlinkPath);
  await fs.writeFile(symlinkPath, "user took ownership");
  const r = await runRemoveCommand({ name: "foo/skills", flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  const content = await fs.readFile(symlinkPath, "utf8");
  assert.equal(content, "user took ownership");
  assert.match(r.stdout.join("\n"), /user took ownership/);
});

test("ankui remove --keep-clone removes registry + symlinks but keeps the bundle dir", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-rm-"));
  const { bundleDir } = await seedBundle(home);
  const r = await runRemoveCommand({ name: "foo/skills", flags: { yes: true, keepClone: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  const stat = await fs.lstat(bundleDir);
  assert.ok(stat.isDirectory());
});
