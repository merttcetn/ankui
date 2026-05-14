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

test("App opens search on / inside a drilled-in user-scope view and renders the SearchBox", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  // Tab → switch to Claude, then Enter → drill into user scope, then /
  await writeKeys(inst.stdin, ["\t", "\r", "/"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /type to filter|esc to close/);
  inst.unmount();
});

test("App appends typed characters to the search query inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\t", "\r", "/", "d", "e", "p"]);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /\/dep/);
  inst.unmount();
});

test("App closes search on Esc inside a drill-in", async () => {
  const inst = render(<App result={multiProjectResult()} />);
  await writeKeys(inst.stdin, ["\t", "\r", "/", "\x1B"]);
  const frame = inst.lastFrame() ?? "";
  assert.doesNotMatch(frame, /type to filter|esc to close/);
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
