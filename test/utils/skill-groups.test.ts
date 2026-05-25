import assert from "node:assert/strict";
import test from "node:test";

import { buildSkill } from "../../src/scanner/adapters/shared.js";
import type { BundleOrigin } from "../../src/scanner/bundle-origin.js";
import { groupSkillsByOrigin } from "../../src/utils/skill-groups.js";
import type { Scope, Skill, SkillKind, SkillSource, ToolId } from "../../src/types.js";

interface MakeSkillInput {
  name: string;
  origin?: BundleOrigin;
  toolId?: ToolId;
  kind?: SkillKind;
  source?: SkillSource;
  scope?: Scope;
  sourcePath?: string;
}

function makeSkill(input: MakeSkillInput): Skill {
  const details: Record<string, unknown> = {};
  if (input.origin !== undefined) {
    details.bundleOrigin = input.origin;
  }

  return buildSkill({
    toolId: input.toolId ?? "claude",
    kind: input.kind ?? "agent_skill",
    name: input.name,
    summary: `${input.name} summary`,
    scope: input.scope ?? "user",
    sourcePath: input.sourcePath ?? `/Users/me/.claude/skills/${input.name}/SKILL.md`,
    source: input.source ?? "directory",
    details
  });
}

test("groupSkillsByOrigin returns an empty array for empty input", () => {
  assert.deepEqual(groupSkillsByOrigin([]), []);
});

test("groupSkillsByOrigin groups all-yours skills into a single 'Your skills' group", () => {
  const skills = [
    makeSkill({ name: "alpha", origin: { kind: "yours", name: "yours" } }),
    makeSkill({ name: "beta", origin: { kind: "yours", name: "yours" } })
  ];

  const groups = groupSkillsByOrigin(skills);

  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.label, "Your skills");
  assert.equal(group.alwaysExpanded, true);
  assert.equal(group.origin.kind, "yours");
  assert.equal(group.origin.name, "yours");
  assert.deepEqual(
    group.skills.map((s) => s.name),
    ["alpha", "beta"]
  );
});

test("groupSkillsByOrigin orders kinds yours → bundle → plugin and labels correctly", () => {
  const skills = [
    makeSkill({
      name: "plug",
      origin: { kind: "plugin", name: "superpowers", rootPath: "~/.claude/plugins/cache/m/superpowers/1" }
    }),
    makeSkill({
      name: "bgs",
      origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
    }),
    makeSkill({ name: "mine", origin: { kind: "yours", name: "yours" } }),
    makeSkill({
      name: "bother",
      origin: { kind: "bundle", name: "other", rootPath: "~/other" }
    })
  ];

  const groups = groupSkillsByOrigin(skills);

  assert.deepEqual(
    groups.map((g) => g.label),
    ["Your skills", "gstack · bundle", "other · bundle", "superpowers · plugin"]
  );
  assert.deepEqual(
    groups.map((g) => g.alwaysExpanded),
    [true, false, false, false]
  );
});

test("groupSkillsByOrigin merges two skills sharing the same (kind, name) into one group", () => {
  const first = makeSkill({
    name: "first",
    sourcePath: "/Users/me/gstack/skills/first/SKILL.md",
    origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });
  const second = makeSkill({
    name: "second",
    sourcePath: "/Users/me/gstack/skills/second/SKILL.md",
    origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });
  const third = makeSkill({
    name: "third",
    sourcePath: "/Users/me/gstack/skills/third/SKILL.md",
    origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });

  const groups = groupSkillsByOrigin([first, second, third]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "gstack · bundle");
  assert.deepEqual(
    groups[0].skills.map((s) => s.name),
    ["first", "second", "third"]
  );
});

test("groupSkillsByOrigin defensively groups skills missing bundleOrigin under 'yours'", () => {
  const orphan = buildSkill({
    toolId: "claude",
    kind: "agent_skill",
    name: "orphan",
    summary: "no origin",
    scope: "user",
    sourcePath: "/Users/me/.claude/skills/orphan/SKILL.md",
    source: "directory"
    // no details — bundleOrigin missing
  });
  const mine = makeSkill({ name: "mine", origin: { kind: "yours", name: "yours" } });

  const groups = groupSkillsByOrigin([orphan, mine]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Your skills");
  assert.equal(groups[0].alwaysExpanded, true);
  assert.deepEqual(
    groups[0].skills.map((s) => s.name),
    ["orphan", "mine"]
  );
});

test("groupSkillsByOrigin sorts bundles alphabetically case-insensitive within a kind", () => {
  const skills = [
    makeSkill({
      name: "z",
      sourcePath: "/Users/me/zeta/skills/z/SKILL.md",
      origin: { kind: "bundle", name: "zeta", rootPath: "~/zeta" }
    }),
    makeSkill({
      name: "a",
      sourcePath: "/Users/me/alpha/skills/a/SKILL.md",
      origin: { kind: "bundle", name: "alpha", rootPath: "~/alpha" }
    }),
    makeSkill({
      name: "m",
      sourcePath: "/Users/me/Mango/skills/m/SKILL.md",
      origin: { kind: "bundle", name: "Mango", rootPath: "~/Mango" }
    })
  ];

  const groups = groupSkillsByOrigin(skills);

  assert.deepEqual(
    groups.map((g) => g.origin.name),
    ["alpha", "Mango", "zeta"]
  );
});

test("groupSkillsByOrigin places builtin and external kinds after bundle and plugin", () => {
  const skills = [
    makeSkill({ name: "ext", origin: { kind: "external", name: "external" } }),
    makeSkill({
      name: "builtinClaude",
      source: "builtin",
      origin: { kind: "builtin", name: "claude" }
    }),
    makeSkill({
      name: "plug",
      origin: { kind: "plugin", name: "superpowers", rootPath: "~/.claude/plugins/cache/m/superpowers/1" }
    }),
    makeSkill({
      name: "bun",
      origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
    }),
    makeSkill({ name: "mine", origin: { kind: "yours", name: "yours" } })
  ];

  const groups = groupSkillsByOrigin(skills);

  assert.deepEqual(
    groups.map((g) => g.label),
    [
      "Your skills",
      "gstack · bundle",
      "superpowers · plugin",
      "claude · builtin",
      "external · external"
    ]
  );
});

test("groupSkillsByOrigin preserves rootPath from the first skill in a group", () => {
  const first = makeSkill({
    name: "first",
    sourcePath: "/Users/me/gstack/skills/first/SKILL.md",
    origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
  });
  // Second skill has a different rootPath; first wins.
  const second = makeSkill({
    name: "second",
    sourcePath: "/Users/me/gstack-alt/skills/second/SKILL.md",
    origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack-alt" }
  });

  const groups = groupSkillsByOrigin([first, second]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].origin.rootPath, "~/gstack");
});

test("groupSkillsByOrigin keeps bundle and builtin sharing a name as separate groups", () => {
  const bundleClaude = makeSkill({
    name: "bundle-claude-skill",
    sourcePath: "/Users/me/claude/skills/x/SKILL.md",
    origin: { kind: "bundle", name: "claude", rootPath: "~/claude" }
  });
  const builtinClaude = makeSkill({
    name: "builtin-claude-skill",
    source: "builtin",
    origin: { kind: "builtin", name: "claude" }
  });

  const groups = groupSkillsByOrigin([bundleClaude, builtinClaude]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["claude · bundle", "claude · builtin"]
  );
  assert.equal(groups[0].skills.length, 1);
  assert.equal(groups[1].skills.length, 1);
});

test("groupSkillsByOrigin omits the yours group entirely when no yours skills are present", () => {
  const skills = [
    makeSkill({
      name: "only",
      origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
    })
  ];

  const groups = groupSkillsByOrigin(skills);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "gstack · bundle");
  assert.equal(groups[0].alwaysExpanded, false);
});

test("groupSkillsByOrigin marks alwaysExpanded false for every non-yours kind", () => {
  const skills = [
    makeSkill({
      name: "b",
      origin: { kind: "bundle", name: "gstack", rootPath: "~/gstack" }
    }),
    makeSkill({
      name: "p",
      origin: { kind: "plugin", name: "superpowers", rootPath: "~/.claude/plugins/cache/m/superpowers/1" }
    }),
    makeSkill({
      name: "i",
      source: "builtin",
      origin: { kind: "builtin", name: "claude" }
    }),
    makeSkill({ name: "e", origin: { kind: "external", name: "external" } })
  ];

  const groups = groupSkillsByOrigin(skills);

  for (const group of groups) {
    assert.equal(group.alwaysExpanded, false, `kind=${group.origin.kind} should be collapsed`);
  }
});
