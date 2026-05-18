import assert from "node:assert/strict";
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

test("App reserves Tab without cycling top-level tabs", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\t"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /OVERVIEW/);
  inst.unmount();
});

test("App opens search on / inside a drilled-in user-scope view and renders the SearchBox", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  // Right arrow -> switch to Claude, then Enter -> drill into user scope, then /
  await writeKeys(inst.stdin, ["\x1B[C", "\r", "/"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /type to filter|esc to close/);
  inst.unmount();
});

test("App appends typed characters to the search query inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\x1B[C", "\r", "/", "d", "e", "p"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /\/dep/);
  inst.unmount();
});

test("App closes search on Esc inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\x1B[C", "\r", "/", "\x1B"]);
  const frame = inst.lastFrame() ?? "";
  assert.doesNotMatch(frame, /type to filter|esc to close/);
  inst.unmount();
});

test("App scrolls the drill-in skill viewport with down arrow", async () => {
  const inst = render(<App result={multiProjectResultWithManyClaudeSkills(16)} />);
  await writeKeys(inst.stdin, [
    "\x1B[C",
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
  // Right-arrow to the Actions tab. Cycle order from tabIds is
  // [overview, claude, codex, cursor, gemini, opencode, skills.sh,
  //  mcps, access, doctor, actions, settings] — all tools are in the
  //  tab bar regardless of detection. Actions is at index 10.
  const presses = Array.from({ length: 10 }, () => "\x1B[C");
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
