import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import {
  ActionsTab,
  type PendingChange
} from "../../../src/tui/screens/ActionsTab.js";
import {
  createSkillId,
  type MultiProjectScanResult,
  type Skill,
  type ToolId
} from "../../../src/types.js";

function activeSkill(name: string): Skill {
  const sourcePath = `/home/.claude/skills/${name}/SKILL.md`;
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

function disabledSkill(name: string): Skill {
  return { ...activeSkill(name), sourcePath: `/home/.claude/skills/.disabled/${name}/SKILL.md`, details: { disabled: true } };
}

function makeTool(id: ToolId, name: string, skills: Skill[]) {
  return { id, name, detected: true, detectedPaths: [], skills, findings: [], stats: {} as any, warnings: [] };
}

function resultFromTools(
  tools: unknown[],
  skillTotal: number
): MultiProjectScanResult {
  // Minimal MultiProjectScanResult; only the userScope.tools[].skills path is read by ActionsTab.
  return {
    scannedAt: "2026-05-18T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope: { scannedAt: "x", cwd: "/cwd", homeDir: "/home", tools: tools as any, findings: [], warnings: [], summary: {} as any },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: skillTotal }
  };
}

function resultWith(skills: Skill[]): MultiProjectScanResult {
  return resultFromTools([makeTool("claude", "Claude", skills)], skills.length);
}

test("ActionsTab lists each skill with its active or disabled state", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), disabledSkill("bravo")])}
      cursor={0}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /alpha/);
  assert.match(frame, /bravo/);
  assert.match(frame, /● alpha/);     // active marker
  assert.match(frame, /○ bravo/);     // disabled marker
  inst.unmount();
});

test("ActionsTab highlights the cursor row", () => {
  // navIndex 0 is the CLAUDE group header; skills start at 1 (alpha), 2 (bravo).
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), activeSkill("bravo")])}
      cursor={2}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /▶\s+● bravo/);  // ACTIVE_PREFIX from icons.ts on the cursor row
  inst.unmount();
});

test("ActionsTab renders an agent group header with enabled/disabled counts", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), disabledSkill("bravo")])}
      cursor={0}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /CLAUDE\s+● 1\s+○ 1\s+\[▾\]/); // expanded glyph + counts
  inst.unmount();
});

test("ActionsTab collapses a group: glyph flips and skills are hidden", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), activeSkill("bravo")])}
      collapsed={["claude"]}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /CLAUDE\s+● 2\s+○ 0\s+\[▸\]/); // collapsed glyph + counts
  assert.doesNotMatch(frame, /alpha/);               // group body hidden
  assert.doesNotMatch(frame, /bravo/);
  inst.unmount();
});

test("ActionsTab shows a (none) placeholder under an expanded empty group", () => {
  const inst = render(<ActionsTab result={resultWith([])} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /CLAUDE\s+● 0\s+○ 0\s+\[▾\]/);
  assert.match(frame, /\(none\)/);
  inst.unmount();
});

test("ActionsTab caps the viewport at visibleCount physical rows, (none) rows included", () => {
  // claude has one skill; codex and cursor are empty + expanded, so each emits
  // a render-only (none) row. With visibleCount=3 the physical window is
  // [CLAUDE header, alpha, CODEX header] — the codex (none) is the 4th
  // physical row and must be clipped, not leaked in on top of the 3 rows.
  const tools = [
    makeTool("claude", "Claude", [activeSkill("alpha")]),
    makeTool("codex", "Codex", []),
    makeTool("cursor", "Cursor", [])
  ];
  const inst = render(
    <ActionsTab result={resultFromTools(tools, 1)} visibleCount={3} cursor={0} />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /CLAUDE/);
  assert.match(frame, /alpha/);
  assert.match(frame, /CODEX/);
  assert.doesNotMatch(frame, /\(none\)/); // 4th physical row, clipped by the window
  inst.unmount();
});

test("ActionsTab renders the last successful action as a status strip and row suffix", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), activeSkill("bravo")])}
      cursor={1}
      actionFeedback={{
        status: "success",
        action: "enable",
        toolId: "claude",
        name: "bravo"
      }}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Enabled claude\/bravo/);
  assert.match(frame, /● bravo\s+just enabled/);
  inst.unmount();
});

test("ActionsTab renders session changes in the right panel", () => {
  const inst = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha"), disabledSkill("bravo")])}
      sessionActions={[
        { action: "disable", toolId: "claude", name: "alpha" },
        { action: "enable", toolId: "claude", name: "bravo" }
      ]}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Saved this session/);
  assert.match(frame, /Enabled this session \(1\)/);
  assert.match(frame, /● claude\/bravo/);
  assert.match(frame, /Disabled this session \(1\)/);
  assert.match(frame, /○ claude\/alpha/);
  inst.unmount();
});

test("ActionsTab renders no-op and error feedback messages", () => {
  const noop = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha")])}
      actionFeedback={{
        status: "noop",
        action: "enable",
        toolId: "claude",
        name: "alpha",
        message: "Already enabled: claude/alpha"
      }}
    />
  );
  assert.match(noop.lastFrame() ?? "", /Already enabled: claude\/alpha/);
  noop.unmount();

  const error = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha")])}
      actionFeedback={{
        status: "error",
        action: "disable",
        toolId: "claude",
        name: "alpha",
        message: "Could not disable claude/alpha: target already exists"
      }}
    />
  );
  assert.match(error.lastFrame() ?? "", /Could not disable claude\/alpha: target already exists/);
  error.unmount();
});

test("ActionsTab disambiguates the success suffix by skill kind", () => {
  const agent = activeSkill("dup");
  const shPath = "/home/.claude/skills/dup/SKILL.md";
  const sh: Skill = {
    ...agent,
    kind: "skills_sh_skill",
    sourcePath: shPath,
    id: createSkillId({
      toolId: "claude",
      kind: "skills_sh_skill",
      name: "dup",
      sourcePath: shPath
    })
  };

  // With kind set, only the matching-kind row gets the "just enabled" suffix.
  const scoped = render(
    <ActionsTab
      result={resultWith([agent, sh])}
      actionFeedback={{
        status: "success",
        action: "enable",
        toolId: "claude",
        kind: "skills_sh_skill",
        name: "dup"
      }}
    />
  );
  const scopedFrame = scoped.lastFrame() ?? "";
  assert.equal((scopedFrame.match(/just enabled/g) ?? []).length, 1);
  scoped.unmount();

  // Without kind (legacy callers), behavior is unchanged: both rows match.
  const legacy = render(
    <ActionsTab
      result={resultWith([agent, sh])}
      actionFeedback={{
        status: "success",
        action: "enable",
        toolId: "claude",
        name: "dup"
      }}
    />
  );
  const legacyFrame = legacy.lastFrame() ?? "";
  assert.equal((legacyFrame.match(/just enabled/g) ?? []).length, 2);
  legacy.unmount();
});

test("ActionsTab glyph + STATE counts reflect the desired (pending) state", () => {
  const alpha = activeSkill("alpha");
  const pending: PendingChange[] = [
    { id: alpha.id, toolId: "claude", kind: "agent_skill", name: "alpha", action: "disable" }
  ];
  const inst = render(
    <ActionsTab result={resultWith([alpha])} pending={pending} />
  );
  const frame = inst.lastFrame() ?? "";
  // Left glyph flips to the desired state even though disk is unchanged.
  assert.match(frame, /○ alpha/);
  assert.doesNotMatch(frame, /● alpha/);
  // STATE counts follow desired, not on-disk.
  assert.match(frame, /● Enabled 0/);
  assert.match(frame, /○ Disabled 1/);
  inst.unmount();
});

test("ActionsTab renders the Pending (unsaved) section from pending props", () => {
  const alpha = activeSkill("alpha");
  const bravo = disabledSkill("bravo");
  const pending: PendingChange[] = [
    { id: alpha.id, toolId: "claude", kind: "agent_skill", name: "alpha", action: "disable" },
    { id: bravo.id, toolId: "claude", kind: "agent_skill", name: "bravo", action: "enable" }
  ];
  const inst = render(
    <ActionsTab result={resultWith([alpha, bravo])} pending={pending} />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Pending \(unsaved\) \(2\)/);
  assert.match(frame, /→ disable claude\/alpha/);
  assert.match(frame, /→ enable {2}claude\/bravo/);
  inst.unmount();
});

test("ActionsTab shows a saving line, then a save summary", () => {
  const saving = render(
    <ActionsTab result={resultWith([activeSkill("alpha")])} saving />
  );
  assert.match(saving.lastFrame() ?? "", /Saving…/);
  saving.unmount();

  const summary = render(
    <ActionsTab
      result={resultWith([activeSkill("alpha")])}
      saveSummary="Saved 1 · 1 failed: Could not disable claude/alpha: target already exists"
    />
  );
  const frame = summary.lastFrame() ?? "";
  assert.match(frame, /Saved 1 · 1 failed/);
  assert.match(frame, /target already exists/);
  summary.unmount();
});
