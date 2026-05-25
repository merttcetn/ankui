import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installSymlink, removeSymlink } from "../../src/writer/symlink.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-sym-"));
}

test("installSymlink creates a symlink from target → source", async () => {
  const dir = await tmp();
  const source = path.join(dir, "source.md");
  const target = path.join(dir, "nested", "target.md");
  await fs.writeFile(source, "content", "utf8");
  const r = await installSymlink({ source, target, allowedRoots: [dir] });
  assert.equal(r.ok, true);
  const linked = await fs.readlink(target);
  assert.equal(path.resolve(path.dirname(target), linked), source);
});

test("installSymlink refuses when target already exists", async () => {
  const dir = await tmp();
  const source = path.join(dir, "source.md");
  const target = path.join(dir, "target.md");
  await fs.writeFile(source, "x");
  await fs.writeFile(target, "existing");
  const r = await installSymlink({ source, target, allowedRoots: [dir] });
  assert.equal(r.ok, false);
  assert.match(r.message ?? "", /exists/);
});

test("installSymlink refuses when target escapes allowedRoots", async () => {
  const dir = await tmp();
  const outside = await tmp();
  const source = path.join(dir, "source.md");
  const target = path.join(outside, "target.md");
  await fs.writeFile(source, "x");
  const r = await installSymlink({ source, target, allowedRoots: [dir] });
  assert.equal(r.ok, false);
  assert.match(r.message ?? "", /outside/);
});

test("installSymlink rollback removes the symlink", async () => {
  const dir = await tmp();
  const source = path.join(dir, "source.md");
  const target = path.join(dir, "target.md");
  await fs.writeFile(source, "x");
  const r = await installSymlink({ source, target, allowedRoots: [dir] });
  assert.equal(r.ok, true);
  await r.rollback?.();
  await assert.rejects(() => fs.lstat(target), /ENOENT/);
});

test("removeSymlink removes only symlinks (not regular files)", async () => {
  const dir = await tmp();
  const source = path.join(dir, "source.md");
  const symlinkPath = path.join(dir, "linked.md");
  const regularPath = path.join(dir, "regular.md");
  await fs.writeFile(source, "x");
  await fs.symlink(source, symlinkPath);
  await fs.writeFile(regularPath, "x");

  const symResult = await removeSymlink(symlinkPath, [dir]);
  assert.equal(symResult.ok, true);
  await assert.rejects(() => fs.lstat(symlinkPath), /ENOENT/);

  const regResult = await removeSymlink(regularPath, [dir]);
  assert.equal(regResult.ok, false);
  assert.match(regResult.message ?? "", /not a symlink/);
  const stat = await fs.lstat(regularPath);
  assert.ok(stat.isFile(), "regular file must not be removed");
});

test("removeSymlink tolerates missing target", async () => {
  const dir = await tmp();
  const r = await removeSymlink(path.join(dir, "nope.md"), [dir]);
  assert.equal(r.ok, true);
  assert.match(r.message ?? "", /already (gone|missing)/);
});
