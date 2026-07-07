import assert from "node:assert/strict";
import test from "node:test";

import {
  actionsNavigableCount,
  buildActionsModel,
  collectActionSkills,
  isMarkdownSkill,
  makeDesiredDisabled
} from "../../../src/tui/util/actions-items.js";
import {
  createAllEmptyTools,
  createSkillId,
  type MultiProjectScanResult,
  type Skill,
  type SkillKind,
  type ToolId
} from "../../../src/types.js";

function skill(
  toolId: ToolId,
  name: string,
  opts: { disabled?: boolean; kind?: SkillKind } = {}
): Skill {
  const kind = opts.kind ?? "agent_skill";
  const sourcePath = `/home/.${toolId}/skills/${
    opts.disabled ? ".disabled/" : ""
  }${name}/SKILL.md`;
  return {
    id: createSkillId({ toolId, kind, name, sourcePath }),
    toolId,
    kind,
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "directory",
    capabilityCategories: [],
    accessLevel: "moderate",
    ...(opts.disabled ? { details: { disabled: true } } : {})
  };
}

function resultWith(
  bySkill: Partial<Record<ToolId, Skill[]>>
): MultiProjectScanResult {
  const tools = createAllEmptyTools().map((tool) => ({
    ...tool,
    detected: true,
    skills: bySkill[tool.id] ?? []
  }));
  return { userScope: { tools } } as unknown as MultiProjectScanResult;
}

const NO_PENDING = makeDesiredDisabled([]);

test("buildActionsModel emits a header for every tool in canonical order", () => {
  const model = buildActionsModel(resultWith({}), new Set(), NO_PENDING);
  const headers = model.items.filter((i) => i.type === "header");
  assert.deepEqual(
    headers.map((h) => (h.type === "header" ? h.toolId : "")),
    ["claude", "codex", "cursor", "gemini", "opencode", "antigravity", "skills-sh"]
  );
  // No tool has skills → every item is a header.
  assert.equal(model.items.length, 7);
});

test("skills appear under their tool header in discovery order", () => {
  const model = buildActionsModel(
    resultWith({ claude: [skill("claude", "z"), skill("claude", "a")] }),
    new Set(),
    NO_PENDING
  );
  const claudeIdx = model.items.findIndex(
    (i) => i.type === "header" && i.toolId === "claude"
  );
  assert.equal(model.items[claudeIdx + 1].type, "skill");
  assert.equal(
    model.items[claudeIdx + 1].type === "skill"
      ? model.items[claudeIdx + 1].skill.name
      : "",
    "z"
  );
  assert.equal(
    model.items[claudeIdx + 2].type === "skill"
      ? model.items[claudeIdx + 2].skill.name
      : "",
    "a" // discovery order preserved, not sorted
  );
});

test("a collapsed group hides its skills but keeps the header", () => {
  const result = resultWith({ claude: [skill("claude", "a")] });
  const expanded = buildActionsModel(result, new Set(), NO_PENDING);
  const collapsed = buildActionsModel(
    result,
    new Set<ToolId>(["claude"]),
    NO_PENDING
  );
  assert.equal(expanded.items.length, collapsed.items.length + 1);
  const header = collapsed.items.find(
    (i) => i.type === "header" && i.toolId === "claude"
  );
  assert.equal(header?.type === "header" ? header.collapsed : false, true);
});

test("noneAfter is true only for an expanded empty group", () => {
  const result = resultWith({ claude: [skill("claude", "a")] });
  const expanded = buildActionsModel(result, new Set(), NO_PENDING);
  assert.equal(expanded.noneAfter.get("claude"), false); // has a skill
  assert.equal(expanded.noneAfter.get("codex"), true); // empty + expanded
  const collapsed = buildActionsModel(
    result,
    new Set<ToolId>(["codex"]),
    NO_PENDING
  );
  assert.equal(collapsed.noneAfter.get("codex"), false); // empty but collapsed
});

test("header counts split enabled vs disabled (pending-aware)", () => {
  const active = skill("claude", "on");
  const off = skill("claude", "off", { disabled: true });
  const result = resultWith({ claude: [active, off] });

  const plain = buildActionsModel(result, new Set(), makeDesiredDisabled([]));
  const claude = plain.items.find(
    (i) => i.type === "header" && i.toolId === "claude"
  );
  assert.deepEqual(
    claude?.type === "header" ? [claude.enabled, claude.disabled] : [],
    [1, 1]
  );

  // Staged disable of the active skill flips the desired counts.
  const staged = buildActionsModel(
    result,
    new Set(),
    makeDesiredDisabled([{ id: active.id, action: "disable" }])
  );
  const claude2 = staged.items.find(
    (i) => i.type === "header" && i.toolId === "claude"
  );
  assert.deepEqual(
    claude2?.type === "header" ? [claude2.enabled, claude2.disabled] : [],
    [0, 2]
  );
});

test("makeDesiredDisabled: staged enable overrides on-disk disabled", () => {
  const off = skill("claude", "off", { disabled: true });
  const desired = makeDesiredDisabled([{ id: off.id, action: "enable" }]);
  assert.equal(desired(off), false);
});

test("isMarkdownSkill excludes non-markdown kinds", () => {
  assert.equal(isMarkdownSkill(skill("claude", "s", { kind: "agent_skill" })), true);
  assert.equal(
    isMarkdownSkill(skill("claude", "s", { kind: "skills_sh_skill" })),
    true
  );
  assert.equal(
    isMarkdownSkill(skill("claude", "m", { kind: "mcp_server" })),
    false
  );
});

test("non-markdown skills are not included in the model or count", () => {
  const result = resultWith({
    claude: [
      skill("claude", "agent", { kind: "agent_skill" }),
      skill("claude", "mcp", { kind: "mcp_server" })
    ]
  });
  const model = buildActionsModel(result, new Set(), NO_PENDING);
  const skills = model.items.filter((i) => i.type === "skill");
  assert.equal(skills.length, 1);
});

test("actionsNavigableCount equals items.length for any collapsed set", () => {
  const result = resultWith({
    claude: [skill("claude", "a"), skill("claude", "b")],
    gemini: [skill("gemini", "g")]
  });
  for (const collapsed of [
    new Set<ToolId>(),
    new Set<ToolId>(["claude"]),
    new Set<ToolId>(["claude", "gemini", "codex"])
  ]) {
    assert.equal(
      actionsNavigableCount(result, collapsed),
      buildActionsModel(result, collapsed, NO_PENDING).items.length
    );
  }
});

test("collectActionSkills ignores the detected flag (same universe as the model)", () => {
  // A tool with detected:false that still carries skills must not vanish from
  // the save path while remaining in the cursor model.
  const tools = createAllEmptyTools().map((tool) => ({
    ...tool,
    detected: tool.id !== "codex",
    skills: tool.id === "codex" ? [skill("codex", "ghost")] : []
  }));
  const result = { userScope: { tools } } as unknown as MultiProjectScanResult;

  const collected = collectActionSkills(result);
  assert.deepEqual(
    collected.map((s) => s.name),
    ["ghost"]
  );

  // Identical to buildActionsModel's skill items with nothing collapsed.
  const modelSkills = buildActionsModel(result, new Set(), NO_PENDING)
    .items.filter((i) => i.type === "skill")
    .map((i) => (i.type === "skill" ? i.skill.name : ""));
  assert.deepEqual(
    modelSkills,
    collected.map((s) => s.name)
  );
});

test("collectActionSkills excludes non-markdown kinds", () => {
  const result = resultWith({
    claude: [
      skill("claude", "agent", { kind: "agent_skill" }),
      skill("claude", "mcp", { kind: "mcp_server" })
    ]
  });
  assert.deepEqual(
    collectActionSkills(result).map((s) => s.name),
    ["agent"]
  );
});
