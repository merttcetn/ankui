import assert from "node:assert/strict";
import test from "node:test";

import { groupSkillsByKind, SKILL_KIND_ORDER } from "../../../src/tui/util/skill-grouping.js";
import { createSkillId, type Skill } from "../../../src/types.js";

function makeSkill(kind: Skill["kind"], name: string): Skill {
  const sourcePath = `/tmp/${name}`;
  return {
    id: createSkillId({ toolId: "claude", kind, name, sourcePath }),
    toolId: "claude",
    kind,
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "directory",
    capabilityCategories: ["unknown"],
    accessLevel: "unknown"
  };
}

test("groupSkillsByKind returns kinds in the canonical order", () => {
  const skills: Skill[] = [
    makeSkill("memory_file", "x"),
    makeSkill("mcp_server", "y"),
    makeSkill("agent_skill", "z")
  ];
  const groups = groupSkillsByKind(skills);
  const orderedKinds = [...groups.keys()];
  assert.ok(orderedKinds.indexOf("mcp_server") < orderedKinds.indexOf("agent_skill"));
  assert.ok(orderedKinds.indexOf("agent_skill") < orderedKinds.indexOf("memory_file"));
});

test("groupSkillsByKind only includes kinds that have skills", () => {
  const skills: Skill[] = [makeSkill("plugins", "a")];
  const groups = groupSkillsByKind(skills);
  assert.equal(groups.size, 1);
  assert.equal(groups.has("plugins"), true);
  assert.equal(groups.has("mcp_server"), false);
});

test("groupSkillsByKind sorts skills within a kind alphabetically (case-insensitive)", () => {
  const skills: Skill[] = [
    makeSkill("agent_skill", "zebra"),
    makeSkill("agent_skill", "Apple"),
    makeSkill("agent_skill", "mango")
  ];
  const groups = groupSkillsByKind(skills);
  const names = (groups.get("agent_skill") ?? []).map((s) => s.name);
  assert.deepEqual(names, ["Apple", "mango", "zebra"]);
});

test("SKILL_KIND_ORDER exposes mcp_server first and memory_file last", () => {
  assert.equal(SKILL_KIND_ORDER[0], "mcp_server");
  assert.equal(SKILL_KIND_ORDER[SKILL_KIND_ORDER.length - 1], "memory_file");
});
