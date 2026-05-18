import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { disableSkill, enableSkill } from "../../src/writer/skill-disable.js";
import { createSkillId, type Skill } from "../../src/types.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-skill-disable-"));
}

function activeSkill(skillsParent: string, name: string): Skill {
  const sourcePath = path.join(skillsParent, name, "SKILL.md");
  return {
    id: createSkillId({ toolId: "claude", kind: "agent_skill", name, sourcePath }),
    toolId: "claude",
    kind: "agent_skill",
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "file",
    capabilityCategories: [],
    accessLevel: "moderate"
  };
}

function disabledSkill(skillsParent: string, name: string): Skill {
  const sourcePath = path.join(skillsParent, ".disabled", name, "SKILL.md");
  return {
    ...activeSkill(skillsParent, name),
    sourcePath,
    details: { disabled: true }
  };
}

async function writeSkillFile(parent: string, name: string): Promise<void> {
  const dir = path.join(parent, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "SKILL.md"), "# Skill\n");
}

test("disableSkill moves <parent>/<name>/ to <parent>/.disabled/<name>/", async () => {
  const home = await tmp();
  const skillsParent = path.join(home, ".claude", "skills");
  await fs.mkdir(skillsParent, { recursive: true });
  await writeSkillFile(skillsParent, "foo");

  const result = await disableSkill(activeSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, true);
  await assert.rejects(() => fs.stat(path.join(skillsParent, "foo")));
  await fs.stat(path.join(skillsParent, ".disabled", "foo", "SKILL.md"));
});

test("enableSkill moves <parent>/.disabled/<name>/ back to <parent>/<name>/", async () => {
  const home = await tmp();
  const skillsParent = path.join(home, ".claude", "skills");
  const disabledParent = path.join(skillsParent, ".disabled");
  await fs.mkdir(disabledParent, { recursive: true });
  await writeSkillFile(disabledParent, "foo");

  const result = await enableSkill(disabledSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, true);
  await fs.stat(path.join(skillsParent, "foo", "SKILL.md"));
  await assert.rejects(() => fs.stat(path.join(disabledParent, "foo")));
});

test("disableSkill creates <parent>/.disabled/ on demand", async () => {
  const home = await tmp();
  const skillsParent = path.join(home, ".claude", "skills");
  await fs.mkdir(skillsParent, { recursive: true });
  await writeSkillFile(skillsParent, "foo");
  await assert.rejects(() => fs.stat(path.join(skillsParent, ".disabled")));

  const result = await disableSkill(activeSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, true);
  await fs.stat(path.join(skillsParent, ".disabled", "foo", "SKILL.md"));
});

test("disableSkill fails with reason=target_exists when a same-name disabled skill already lives there", async () => {
  const home = await tmp();
  const skillsParent = path.join(home, ".claude", "skills");
  await fs.mkdir(skillsParent, { recursive: true });
  await writeSkillFile(skillsParent, "foo");
  await writeSkillFile(path.join(skillsParent, ".disabled"), "foo");

  const result = await disableSkill(activeSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "target_exists");
});

test("enableSkill fails with reason=target_exists when a same-name active skill already lives there", async () => {
  const home = await tmp();
  const skillsParent = path.join(home, ".claude", "skills");
  await fs.mkdir(skillsParent, { recursive: true });
  await writeSkillFile(skillsParent, "foo");
  await writeSkillFile(path.join(skillsParent, ".disabled"), "foo");

  const result = await enableSkill(disabledSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "target_exists");
});

test("disableSkill rejects skills whose sourcePath escapes the home/cwd allowlist", async () => {
  const home = await tmp();
  const outside = await tmp();
  const skillsParent = path.join(outside, ".claude", "skills");
  await fs.mkdir(skillsParent, { recursive: true });
  await writeSkillFile(skillsParent, "foo");

  const result = await disableSkill(activeSkill(skillsParent, "foo"), {
    homeDir: home,
    cwd: home
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "outside_allowed_roots");
});
