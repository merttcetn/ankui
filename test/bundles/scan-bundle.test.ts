import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { findBundleSkills } from "../../src/bundles/scan-bundle.js";

async function tmpBundle(layout: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-bundle-"));
  for (const [rel, contents] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contents, "utf8");
  }
  return dir;
}

test("findBundleSkills returns each SKILL.md with its parent dir as skillName", async () => {
  const dir = await tmpBundle({
    "autoplan/SKILL.md": "---\nname: autoplan\n---\nx\n",
    "grill-me/SKILL.md": "---\nname: grill-me\n---\nx\n",
    "README.md": "ignore me"
  });
  const skills = await findBundleSkills(dir);
  const names = skills.map((s) => s.skillName).sort();
  assert.deepEqual(names, ["autoplan", "grill-me"]);
  for (const s of skills) {
    assert.ok(s.skillMdPath.endsWith("SKILL.md"));
    assert.ok(s.skillMdPath.startsWith(dir));
  }
});

test("findBundleSkills skips .git/", async () => {
  const dir = await tmpBundle({
    "autoplan/SKILL.md": "x",
    ".git/HEAD": "ref: refs/heads/main",
    ".git/objects/00/0000": "x"
  });
  const skills = await findBundleSkills(dir);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].skillName, "autoplan");
});

test("findBundleSkills skips sensitive path segments", async () => {
  const dir = await tmpBundle({
    "autoplan/SKILL.md": "x",
    "sessions/SKILL.md": "should be skipped",
    ".env/SKILL.md": "should be skipped"
  });
  const skills = await findBundleSkills(dir);
  assert.deepEqual(skills.map((s) => s.skillName).sort(), ["autoplan"]);
});

test("findBundleSkills returns [] for a bundle with no SKILL.md files", async () => {
  const dir = await tmpBundle({ "README.md": "x", "src/foo.ts": "x" });
  const skills = await findBundleSkills(dir);
  assert.deepEqual(skills, []);
});

test("findBundleSkills traverses nested layouts (skills/<name>/SKILL.md)", async () => {
  const dir = await tmpBundle({
    "skills/autoplan/SKILL.md": "x",
    "skills/grill-me/SKILL.md": "x"
  });
  const skills = await findBundleSkills(dir);
  assert.deepEqual(skills.map((s) => s.skillName).sort(), ["autoplan", "grill-me"]);
});
