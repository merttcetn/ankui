import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialState,
  tuiReducer,
  type DrillFrame,
  type TuiState
} from "../../../src/tui/state/tui-state.js";
import { cycleTabId } from "../../../src/tui/state/navigation.js";
import type { MultiProjectScanResult } from "../../../src/types.js";

const TABS = ["overview", "claude", "codex", "cursor"] as const;

function makeResult(projectPaths: readonly string[]): MultiProjectScanResult {
  // Hand-rolled stub — only the fields the reducer reads. We never call into
  // real scanner code from a pure-reducer test.
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/home/u",
    homeDir: "/home/u",
    devRoots: [],
    userScope: {
      scannedAt: "2026-05-14T00:00:00.000Z",
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: [],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 0,
        totalSkills: 0,
        totalMcpServers: 0,
        uniqueMcpServers: 0,
        customCommands: 0,
        customTools: 0,
        plugins: 0,
        memoryFiles: 0,
        agentSkills: 0,
        skillsShSkills: 0,
        totalFindings: 0,
        broadAccessFindings: 0
      }
    },
    projects: projectPaths.map((projectPath) => ({
      projectPath,
      displayPath: projectPath,
      scan: {
        scannedAt: "2026-05-14T00:00:00.000Z",
        cwd: projectPath,
        homeDir: "/home/u",
        tools: [],
        findings: [],
        warnings: [],
        summary: {
          detectedTools: 0,
          totalSkills: 0,
          totalMcpServers: 0,
          uniqueMcpServers: 0,
          customCommands: 0,
          customTools: 0,
          plugins: 0,
          memoryFiles: 0,
          agentSkills: 0,
          skillsShSkills: 0,
          totalFindings: 0,
          broadAccessFindings: 0
        }
      }
    })),
    warnings: [],
    totals: {
      projectCount: projectPaths.length,
      skillsAcrossProjects: 0,
      userScopeSkills: 0
    }
  };
}

const INITIAL_STATE = createInitialState(makeResult([]));

test("createInitialState produces activeTab='overview' and empty drillStack", () => {
  const state = createInitialState(makeResult([]));
  assert.equal(state.activeTab, "overview");
  assert.deepEqual(state.drillStack, []);
});

test("setTab replaces activeTab and clears drillStack", () => {
  const state: TuiState = {
    activeTab: "overview",
    drillStack: [{ kind: "userScope", toolId: "claude" }],
    result: makeResult([])
  };
  const next = tuiReducer(state, { type: "setTab", id: "codex" });
  assert.equal(next.activeTab, "codex");
  assert.deepEqual(next.drillStack, []);
});

test("drillIn pushes a frame onto drillStack without changing activeTab", () => {
  const next = tuiReducer(INITIAL_STATE, {
    type: "drillIn",
    frame: { kind: "userScope", toolId: "claude" }
  });
  assert.equal(next.activeTab, "overview");
  assert.equal(next.drillStack.length, 1);
  assert.deepEqual(next.drillStack[0], { kind: "userScope", toolId: "claude" });
});

test("drillOut pops the top of drillStack", () => {
  const state: TuiState = {
    activeTab: "claude",
    drillStack: [
      { kind: "userScope", toolId: "claude" } as DrillFrame,
      { kind: "project", toolId: "claude", projectPath: "/p" } as DrillFrame
    ],
    result: makeResult([])
  };
  const next = tuiReducer(state, { type: "drillOut" });
  assert.equal(next.drillStack.length, 1);
  assert.equal((next.drillStack[0] as { kind: string }).kind, "userScope");
});

test("drillOut on empty drillStack is a no-op", () => {
  const next = tuiReducer(INITIAL_STATE, { type: "drillOut" });
  assert.deepEqual(next, INITIAL_STATE);
});

test("cycleTab(next) goes overview → claude → codex → cursor → overview", () => {
  let state = INITIAL_STATE;
  state = tuiReducer(state, { type: "cycleTab", direction: "next", tabs: [...TABS] });
  assert.equal(state.activeTab, "claude");
  state = tuiReducer(state, { type: "cycleTab", direction: "next", tabs: [...TABS] });
  assert.equal(state.activeTab, "codex");
  state = tuiReducer(state, { type: "cycleTab", direction: "next", tabs: [...TABS] });
  assert.equal(state.activeTab, "cursor");
  state = tuiReducer(state, { type: "cycleTab", direction: "next", tabs: [...TABS] });
  assert.equal(state.activeTab, "overview");
});

test("cycleTab(prev) wraps backward", () => {
  let state = INITIAL_STATE;
  state = tuiReducer(state, { type: "cycleTab", direction: "prev", tabs: [...TABS] });
  assert.equal(state.activeTab, "cursor");
});

test("cycleTabId helper handles unknown current tab by returning first", () => {
  assert.equal(cycleTabId("unknown", "next", [...TABS]), "overview");
  assert.equal(cycleTabId("unknown", "prev", [...TABS]), "overview");
});

test("setResult replaces the held result and preserves activeTab", () => {
  const initial: TuiState = {
    activeTab: "claude",
    drillStack: [],
    result: makeResult(["/p1"])
  };
  const next = tuiReducer(initial, {
    type: "setResult",
    result: makeResult(["/p1", "/p2"])
  });
  assert.equal(next.activeTab, "claude");
  assert.equal(next.result.projects.length, 2);
  assert.deepEqual(next.drillStack, []);
});

test("setResult preserves a userScope drill frame", () => {
  const state: TuiState = {
    activeTab: "claude",
    drillStack: [{ kind: "userScope", toolId: "claude" }],
    result: makeResult([])
  };
  const next = tuiReducer(state, {
    type: "setResult",
    result: makeResult([])
  });
  assert.equal(next.drillStack.length, 1);
  assert.deepEqual(next.drillStack[0], { kind: "userScope", toolId: "claude" });
});

test("setResult preserves a project drill frame when the project is still present", () => {
  const state: TuiState = {
    activeTab: "claude",
    drillStack: [{ kind: "project", toolId: "claude", projectPath: "/p1" }],
    result: makeResult(["/p1"])
  };
  const next = tuiReducer(state, {
    type: "setResult",
    result: makeResult(["/p1", "/p2"])
  });
  assert.equal(next.drillStack.length, 1);
  assert.deepEqual(next.drillStack[0], {
    kind: "project",
    toolId: "claude",
    projectPath: "/p1"
  });
});

test("setResult drops a project drill frame whose project disappeared", () => {
  const state: TuiState = {
    activeTab: "claude",
    drillStack: [{ kind: "project", toolId: "claude", projectPath: "/p1" }],
    result: makeResult(["/p1"])
  };
  const next = tuiReducer(state, {
    type: "setResult",
    result: makeResult(["/p2"])
  });
  assert.deepEqual(next.drillStack, []);
});
