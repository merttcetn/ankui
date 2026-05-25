import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPlan, type Plan } from "../../src/bundles/install.js";
import type { BundleSkill } from "../../src/bundles/scan-bundle.js";

async function tmpHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-inst-"));
}

test("buildPlan emits installs for each (skill, tool) and detects no conflicts on clean disk", async () => {
  const home = await tmpHome();
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  const skills: BundleSkill[] = [
    { skillName: "autoplan", skillMdPath: "/bundle/autoplan/SKILL.md" },
    { skillName: "grill-me", skillMdPath: "/bundle/grill-me/SKILL.md" }
  ];
  const plan: Plan = await buildPlan({
    skills,
    tools: ["claude"],
    scope: "user",
    homeDir: home,
    cwd: "/cwd"
  });
  assert.equal(plan.installs.length, 2);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.installs[0].symlinkPath, path.join(home, ".claude", "skills", "autoplan", "SKILL.md"));
});

test("buildPlan flags conflicts when target path exists", async () => {
  const home = await tmpHome();
  const existing = path.join(home, ".claude", "skills", "autoplan", "SKILL.md");
  await fs.mkdir(path.dirname(existing), { recursive: true });
  await fs.writeFile(existing, "your own");
  const plan = await buildPlan({
    skills: [{ skillName: "autoplan", skillMdPath: "/bundle/autoplan/SKILL.md" }],
    tools: ["claude"],
    scope: "user",
    homeDir: home,
    cwd: "/cwd"
  });
  assert.equal(plan.installs.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].source, "your_file");
});

test("buildPlan annotates conflicts whose target is a symlink as bundle conflict", async () => {
  const home = await tmpHome();
  const otherBundle = path.join(home, ".ankui", "bundles", "other", "x", "autoplan", "SKILL.md");
  await fs.mkdir(path.dirname(otherBundle), { recursive: true });
  await fs.writeFile(otherBundle, "other");
  const symlinkPath = path.join(home, ".claude", "skills", "autoplan", "SKILL.md");
  await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
  await fs.symlink(otherBundle, symlinkPath);

  const plan = await buildPlan({
    skills: [{ skillName: "autoplan", skillMdPath: "/bundle/autoplan/SKILL.md" }],
    tools: ["claude"],
    scope: "user",
    homeDir: home,
    cwd: "/cwd"
  });
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].source, "other_bundle");
});

test("buildPlan respects project scope: targets land under cwd not homeDir", async () => {
  const home = await tmpHome();
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cwd-"));
  const plan = await buildPlan({
    skills: [{ skillName: "autoplan", skillMdPath: "/bundle/autoplan/SKILL.md" }],
    tools: ["claude"],
    scope: "project",
    homeDir: home,
    cwd
  });
  assert.equal(plan.installs[0].symlinkPath, path.join(cwd, ".claude", "skills", "autoplan", "SKILL.md"));
});
