import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { scanMarkdownSkillTree } from "../../../src/scanner/adapters/shared.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-skill-tree-"));
}

async function writeSkill(parent: string, name: string, body = "# title"): Promise<void> {
  await fs.mkdir(path.join(parent, name), { recursive: true });
  await fs.writeFile(path.join(parent, name, "SKILL.md"), body);
}

test("scanMarkdownSkillTree returns active skills and skips .disabled/", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "active-1");
  await writeSkill(parent, "active-2");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.deepEqual(
    result.active.map((s) => s.sourcePath).sort(),
    [
      path.join(parent, "active-1", "SKILL.md"),
      path.join(parent, "active-2", "SKILL.md")
    ].sort()
  );
  assert.deepEqual(result.disabled, []);
});

test("scanMarkdownSkillTree separately surfaces .disabled/ children with details.disabled=true", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "still-on");
  await writeSkill(path.join(parent, ".disabled"), "turned-off");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.equal(result.active.length, 1);
  assert.equal(result.active[0].sourcePath, path.join(parent, "still-on", "SKILL.md"));

  assert.equal(result.disabled.length, 1);
  assert.equal(
    result.disabled[0].sourcePath,
    path.join(parent, ".disabled", "turned-off", "SKILL.md")
  );
  assert.equal(result.disabled[0].details?.disabled, true);
});

test("scanMarkdownSkillTree returns empty lists when the parent is missing", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.deepEqual(result.active, []);
  assert.deepEqual(result.disabled, []);
});

test("scanMarkdownSkillTree returns empty disabled list when .disabled/ is missing", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "lonely");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.equal(result.active.length, 1);
  assert.deepEqual(result.disabled, []);
});
