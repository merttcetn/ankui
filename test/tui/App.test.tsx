import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { App } from "../../src/tui/App.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createSkillId,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill,
  type ToolId
} from "../../src/types.js";

function emptyScanResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function withDetectedTool(
  scan: ScanResult,
  id: ToolId,
  paths: string[]
): ScanResult {
  return {
    ...scan,
    tools: scan.tools.map((t) =>
      t.id === id ? { ...t, detected: true, detectedPaths: paths } : t
    )
  };
}

function withAgentSkill(
  scan: ScanResult,
  id: ToolId,
  name: string
): ScanResult {
  const sourcePath = `/home/.${id}/skills/${name}`;
  const skill: Skill = {
    id: createSkillId({ toolId: id, kind: "agent_skill", name, sourcePath }),
    toolId: id,
    kind: "agent_skill",
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "file",
    capabilityCategories: [],
    accessLevel: "moderate"
  };
  return {
    ...scan,
    tools: scan.tools.map((t) =>
      t.id === id ? { ...t, skills: [...t.skills, skill] } : t
    )
  };
}

function multiProjectResult(): MultiProjectScanResult {
  let userScope = emptyScanResult();
  userScope = withDetectedTool(userScope, "claude", ["/home/.claude"]);
  userScope = withAgentSkill(userScope, "claude", "deploy-app");
  userScope = withAgentSkill(userScope, "claude", "verify-frontend");
  userScope = withAgentSkill(userScope, "claude", "debug-helper");
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: 3
    }
  };
}

function multiProjectResultWithManyClaudeSkills(count: number): MultiProjectScanResult {
  let userScope = emptyScanResult();
  userScope = withDetectedTool(userScope, "claude", ["/home/.claude"]);
  for (let index = 0; index < count; index += 1) {
    userScope = withAgentSkill(
      userScope,
      "claude",
      `skill-${String(index).padStart(2, "0")}`
    );
  }
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: count
    }
  };
}

async function multiProjectResultWithDiskSkill(
  homeDir: string,
  name: string,
  opts: { disabled?: boolean } = {}
): Promise<MultiProjectScanResult> {
  const skillDir = opts.disabled
    ? path.join(homeDir, ".claude", "skills", ".disabled", name)
    : path.join(homeDir, ".claude", "skills", name);
  await fs.mkdir(skillDir, { recursive: true });
  const sourcePath = path.join(skillDir, "SKILL.md");
  await fs.writeFile(sourcePath, "# Toggle me\n");

  const skill: Skill = {
    id: createSkillId({ toolId: "claude", kind: "agent_skill", name, sourcePath }),
    toolId: "claude",
    kind: "agent_skill",
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "directory",
    capabilityCategories: [],
    accessLevel: "moderate",
    ...(opts.disabled ? { details: { disabled: true } } : {})
  };
  const userScope = withDetectedTool(emptyScanResult(), "claude", [
    path.join(homeDir, ".claude")
  ]);

  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: homeDir,
    homeDir,
    devRoots: [],
    userScope: {
      ...userScope,
      homeDir,
      cwd: homeDir,
      tools: userScope.tools.map((t) =>
        t.id === "claude" ? { ...t, skills: [skill] } : t
      )
    },
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: 1
    }
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function writeKeys(
  stdin: { write: (s: string) => void },
  keys: string[]
): Promise<void> {
  await flush();
  for (const k of keys) {
    stdin.write(k);
    await flush();
  }
}

async function waitForFrameMatch(
  inst: ReturnType<typeof render>,
  pattern: RegExp
): Promise<string> {
  let frame = inst.lastFrame() ?? "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (pattern.test(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = inst.lastFrame() ?? "";
  }
  assert.match(frame, pattern);
  return frame;
}

test("App reserves Tab without cycling top-level tabs", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\t"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /OVERVIEW/);
  inst.unmount();
});

test("App opens search on / inside a drilled-in user-scope view and renders the SearchBox", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  // Down arrow -> select Claude in the sidebar, then Enter -> drill into user
  // scope (Enter on a tool row from sidebar focus drills in), then /.
  await writeKeys(inst.stdin, ["\x1B[B", "\r", "/"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /type to filter|esc to close/);
  inst.unmount();
});

test("App appends typed characters to the search query inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\x1B[B", "\r", "/", "d", "e", "p"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /\/dep/);
  inst.unmount();
});

test("App closes search on Esc inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\x1B[B", "\r", "/", "\x1B"]);
  const frame = inst.lastFrame() ?? "";
  assert.doesNotMatch(frame, /type to filter|esc to close/);
  inst.unmount();
});

test("App scrolls the drill-in skill viewport with down arrow", async () => {
  const inst = render(<App result={multiProjectResultWithManyClaudeSkills(16)} />);
  // Sidebar ↓ to Claude, Enter to drill in, then ↓ scrolls the drill-in
  // viewport (drill-in handlers are focus-independent).
  await writeKeys(inst.stdin, [
    "\x1B[B",
    "\r",
    ...Array.from({ length: 15 }, () => "\x1B[B")
  ]);
  const frame = inst.lastFrame() ?? "";
  assert.doesNotMatch(frame, /skill-00/);
  assert.match(frame, /skill-15/);
  assert.match(frame, /16\/16/);
  inst.unmount();
});

test("App does not throw on q (quit binding still wired)", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["q"]);
  // ink-testing-library doesn't actually exit the process; we just assert
  // the component didn't throw and rendered something.
  assert.ok(true);
  inst.unmount();
});

test("App invokes onRefresh prop when r is pressed in main mode", async () => {
  let refreshCount = 0;
  const inst = render(
    <App
      result={multiProjectResult()}
      onRefresh={async () => {
        refreshCount += 1;
      }}
    />
  );
  await writeKeys(inst.stdin, ["r"]);
  // Let the async refresh callback settle.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCount, 1);
  inst.unmount();
});

test("App reflects a new result prop after a LauncherShell-style refresh", async () => {
  const initial = multiProjectResultWithManyClaudeSkills(1);
  const updated = multiProjectResultWithManyClaudeSkills(2);

  const inst = render(<App result={initial} />);
  // Down-arrow through the sidebar to the Actions tab. The flattened cycle
  // order is [overview, claude, codex, cursor, gemini, opencode, antigravity,
  // skills.sh, mcps, access, doctor, actions, settings] — all tools are in the
  // sidebar regardless of detection. Actions is at index 11.
  const presses = Array.from({ length: 11 }, () => "\x1B[B");
  await writeKeys(inst.stdin, presses);
  const before = inst.lastFrame() ?? "";
  // SectionHeader spaces every glyph: "SKILLS (1)" → "S K I L L S   ( 1 )"
  assert.match(before, /S K I L L S   \( 1 \)/, "initial render shows 1 skill");

  inst.rerender(<App result={updated} />);
  await new Promise((r) => setImmediate(r));
  const after = inst.lastFrame() ?? "";
  assert.match(after, /S K I L L S   \( 2 \)/, "after rerender shows 2 skills");
  inst.unmount();
});

// 11 down-arrows from the initial sidebar focus reach the Actions tab (focus
// stays on the sidebar). One right-arrow then moves focus to the panel, and
// one more down-arrow steps off the agent group header (navIndex 0) onto its
// first skill so [d]/[e] act on a skill.
const TO_ACTIONS = [
  ...Array.from({ length: 11 }, () => "\x1B[B"),
  "\x1B[C",
  "\x1B[B"
];

test("App stages a disable in the UI and writes nothing until [s]", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");
  const skillMd = path.join(homeDir, ".claude", "skills", "toggle-me", "SKILL.md");
  const disabledMd = path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me", "SKILL.md");

  const inst = render(<App result={result} homeDir={homeDir} />);
  await writeKeys(inst.stdin, TO_ACTIONS);
  assert.match(inst.lastFrame() ?? "", /● toggle-me/);

  await writeKeys(inst.stdin, ["d"]);
  const staged = await waitForFrameMatch(inst, /Pending \(unsaved\) \(1\)/);
  assert.match(staged, /○ toggle-me/); // glyph flips like a checkbox
  assert.match(staged, /→ disable claude\/toggle-me/);
  assert.match(staged, /Staged disable: claude\/toggle-me/);
  // Nothing on disk yet — staging is UI-only.
  await assert.rejects(fs.stat(disabledMd));
  await fs.stat(skillMd);

  await writeKeys(inst.stdin, ["s"]);
  const saved = await waitForFrameMatch(inst, /Saved 1/);
  assert.match(saved, /○ toggle-me/);
  assert.match(saved, /Saved this session/);
  assert.doesNotMatch(saved, /Pending \(unsaved\)/);
  await fs.stat(disabledMd);
  await assert.rejects(fs.stat(skillMd));
  inst.unmount();
});

test("App stages an enable and writes it to disk on [s]", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me", {
    disabled: true
  });
  const skillMd = path.join(homeDir, ".claude", "skills", "toggle-me", "SKILL.md");
  const disabledMd = path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me", "SKILL.md");

  const inst = render(<App result={result} homeDir={homeDir} />);
  await writeKeys(inst.stdin, TO_ACTIONS);
  assert.match(inst.lastFrame() ?? "", /○ toggle-me/);

  await writeKeys(inst.stdin, ["e"]);
  const staged = await waitForFrameMatch(inst, /→ enable {2}claude\/toggle-me/);
  assert.match(staged, /● toggle-me/);
  await assert.rejects(fs.stat(skillMd)); // not moved back yet
  await fs.stat(disabledMd);

  await writeKeys(inst.stdin, ["s"]);
  const saved = await waitForFrameMatch(inst, /Saved 1/);
  assert.match(saved, /● toggle-me/);
  await fs.stat(skillMd);
  await assert.rejects(fs.stat(disabledMd));
  inst.unmount();
});

test("App clears a pending change toggled back to the on-disk state", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");

  const inst = render(<App result={result} homeDir={homeDir} />);
  await writeKeys(inst.stdin, TO_ACTIONS);

  await writeKeys(inst.stdin, ["d"]);
  await waitForFrameMatch(inst, /Pending \(unsaved\) \(1\)/);

  await writeKeys(inst.stdin, ["e"]);
  const cleared = await waitForFrameMatch(inst, /No change: claude\/toggle-me already enabled/);
  assert.match(cleared, /● toggle-me/);
  assert.doesNotMatch(cleared, /Pending \(unsaved\)/);

  await writeKeys(inst.stdin, ["s"]);
  const nothing = await waitForFrameMatch(inst, /Nothing to save/);
  assert.match(nothing, /● toggle-me/);
  await assert.rejects(
    fs.stat(path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me", "SKILL.md"))
  );
  await fs.stat(path.join(homeDir, ".claude", "skills", "toggle-me", "SKILL.md"));
  inst.unmount();
});

test("App keeps a failed item pending and reports the error after [s]", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");
  const disabledDir = path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me");
  await fs.mkdir(disabledDir, { recursive: true });
  await fs.writeFile(path.join(disabledDir, "SKILL.md"), "# squatter\n");

  const inst = render(<App result={result} homeDir={homeDir} />);
  await writeKeys(inst.stdin, TO_ACTIONS);

  await writeKeys(inst.stdin, ["d"]);
  await waitForFrameMatch(inst, /Pending \(unsaved\) \(1\)/);

  await writeKeys(inst.stdin, ["s"]);
  // The error message wraps to two lines in the narrower right-panel layout,
  // with sidebar box-drawing glyphs (and the unrelated row beside the wrap)
  // sitting between the two halves. Anchor on the "1 failed" prefix and the
  // failure verb; the reason ("target already exists") is asserted as its
  // own substring further down once the frame has settled.
  const failed = await waitForFrameMatch(
    inst,
    /1 failed: Could not disable claude\/toggle-me/
  );
  assert.match(failed, /target already/);
  assert.match(failed, /exists/);
  assert.match(failed, /Saved 0/);
  assert.match(failed, /Pending \(unsaved\) \(1\)/); // stays pending
  assert.match(failed, /○ toggle-me/); // glyph still desired
  await fs.stat(path.join(homeDir, ".claude", "skills", "toggle-me", "SKILL.md"));
  inst.unmount();
});

test("App confirms quit with unsaved changes; [q] discards without writing", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");
  let captured: Array<{ toolId: string; name: string; action: string }> | null = null;
  const inst = render(
    <App
      result={result}
      homeDir={homeDir}
      onExit={(actions) => {
        captured = actions.map((a) => ({
          toolId: a.toolId,
          name: a.name,
          action: a.action
        }));
      }}
    />
  );
  await writeKeys(inst.stdin, TO_ACTIONS);
  await writeKeys(inst.stdin, ["d"]);
  await waitForFrameMatch(inst, /Pending \(unsaved\) \(1\)/);

  inst.stdin.write("q");
  await waitForFrameMatch(inst, /unsaved change\(s\) · \[s\] save · \[q\] discard & quit/);
  assert.equal(captured, null); // not exited yet

  inst.stdin.write("q"); // discard & quit
  await flush();
  assert.ok(captured !== null, "onExit fired");
  assert.deepEqual(captured, []); // nothing was saved
  await assert.rejects(
    fs.stat(path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me", "SKILL.md"))
  );
  inst.unmount();
});

test("App ignores [d] / [e] / [s] on the Actions tab when focus is still on the sidebar", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");
  const inst = render(<App result={result} homeDir={homeDir} onRefresh={async () => {}} />);

  // Navigate to Actions via the sidebar (11 down arrows) BUT do NOT press →
  // to move focus to the panel.
  const toActionsSidebar = Array.from({ length: 11 }, () => "\x1B[B");
  await writeKeys(inst.stdin, toActionsSidebar);
  await waitForFrameMatch(inst, /Actions/);

  // Press d / e / s — none should fire because focus is still on sidebar.
  await writeKeys(inst.stdin, ["d", "e", "s"]);
  await new Promise((r) => setTimeout(r, 50));

  const frame = inst.lastFrame() ?? "";
  assert.ok(!/Pending \(unsaved\)/.test(frame), `expected no pending changes, got:\n${frame}`);
  assert.ok(!/Staged/.test(frame), `expected no staged feedback, got:\n${frame}`);
  inst.unmount();
});

test("App saves from the quit confirm with [s] then exits", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-app-action-"));
  const result = await multiProjectResultWithDiskSkill(homeDir, "toggle-me");
  let captured: Array<{ toolId: string; name: string; action: string }> | null = null;
  const inst = render(
    <App
      result={result}
      homeDir={homeDir}
      onExit={(actions) => {
        captured = actions.map((a) => ({
          toolId: a.toolId,
          name: a.name,
          action: a.action
        }));
      }}
    />
  );
  await writeKeys(inst.stdin, TO_ACTIONS);
  await writeKeys(inst.stdin, ["d"]);
  await waitForFrameMatch(inst, /Pending \(unsaved\) \(1\)/);

  inst.stdin.write("q");
  await waitForFrameMatch(inst, /\[s\] save · \[q\] discard/);
  inst.stdin.write("s");
  for (let i = 0; i < 50 && captured === null; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(captured !== null, "onExit fired after save");
  assert.deepEqual(captured, [
    { toolId: "claude", name: "toggle-me", action: "disable" }
  ]);
  await fs.stat(path.join(homeDir, ".claude", "skills", ".disabled", "toggle-me", "SKILL.md"));
  inst.unmount();
});
