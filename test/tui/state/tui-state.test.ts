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
  assert.equal(state.listCursor, 0);
});

test("setTab replaces activeTab and clears drillStack", () => {
  const state: TuiState = {
    activeTab: "overview",
    drillStack: [{ kind: "userScope", toolId: "claude" }],
    result: makeResult([]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
  };
  const next = tuiReducer(state, { type: "setTab", id: "codex" });
  assert.equal(next.activeTab, "codex");
  assert.deepEqual(next.drillStack, []);
  assert.equal(next.listCursor, 0);
});

test("drillIn pushes a frame onto drillStack without changing activeTab", () => {
  const next = tuiReducer(INITIAL_STATE, {
    type: "drillIn",
    frame: { kind: "userScope", toolId: "claude" }
  });
  assert.equal(next.activeTab, "overview");
  assert.equal(next.drillStack.length, 1);
  assert.deepEqual(next.drillStack[0], { kind: "userScope", toolId: "claude" });
  assert.equal(next.listCursor, 0);
});

test("drillOut pops the top of drillStack", () => {
  const state: TuiState = {
    activeTab: "claude",
    drillStack: [
      { kind: "userScope", toolId: "claude" } as DrillFrame,
      { kind: "project", toolId: "claude", projectPath: "/p" } as DrillFrame
    ],
    result: makeResult([]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
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

test("cycleTab walks through actions tab in the cross-tool row", () => {
  const tabs = ["overview", "claude", "mcps", "access", "doctor", "actions", "settings"] as const;
  const state: TuiState = {
    activeTab: "doctor",
    drillStack: [],
    result: makeResult([]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
  };
  const next = tuiReducer(state, { type: "cycleTab", direction: "next", tabs });
  assert.equal(next.activeTab, "actions");
});

test("setResult replaces the held result and preserves activeTab", () => {
  const initial: TuiState = {
    activeTab: "claude",
    drillStack: [],
    result: makeResult(["/p1"]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
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
    result: makeResult([]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
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
    result: makeResult(["/p1"]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
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
    result: makeResult(["/p1"]),
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: []
  };
  const next = tuiReducer(state, {
    type: "setResult",
    result: makeResult(["/p2"])
  });
  assert.deepEqual(next.drillStack, []);
});

test("createInitialState seeds searchOpen=false and searchQuery=''", () => {
  const state = createInitialState(makeResult([]));
  assert.equal(state.searchOpen, false);
  assert.equal(state.searchQuery, "");
});

test("searchOpen action sets searchOpen=true and clears the query", () => {
  const next = tuiReducer(INITIAL_STATE, { type: "searchOpen" });
  assert.equal(next.searchOpen, true);
  assert.equal(next.searchQuery, "");
});

test("searchClose action sets searchOpen=false and clears the query", () => {
  const opened = tuiReducer(INITIAL_STATE, { type: "searchOpen" });
  const withQuery = tuiReducer(opened, {
    type: "searchSetQuery",
    query: "deploy"
  });
  const closed = tuiReducer(withQuery, { type: "searchClose" });
  assert.equal(closed.searchOpen, false);
  assert.equal(closed.searchQuery, "");
});

test("searchSetQuery updates the query without changing searchOpen", () => {
  const opened = tuiReducer(INITIAL_STATE, { type: "searchOpen" });
  const next = tuiReducer(opened, {
    type: "searchSetQuery",
    query: "verify"
  });
  assert.equal(next.searchOpen, true);
  assert.equal(next.searchQuery, "verify");
  assert.equal(next.listCursor, 0);
});

test("listMove advances and clamps listCursor", () => {
  let state = createInitialState(makeResult([]));
  state = tuiReducer(state, { type: "listMove", direction: "down", max: 3 });
  state = tuiReducer(state, { type: "listMove", direction: "down", max: 3 });
  state = tuiReducer(state, { type: "listMove", direction: "down", max: 3 });
  assert.equal(state.listCursor, 2);

  state = tuiReducer(state, { type: "listMove", direction: "up", max: 3 });
  assert.equal(state.listCursor, 1);
});

test("setTab clears search state alongside drillStack", () => {
  const state: TuiState = {
    activeTab: "overview",
    drillStack: [],
    result: makeResult([]),
    searchOpen: true,
    searchQuery: "deploy",
    listCursor: 4,
    actionsCollapsed: []
  };
  const next = tuiReducer(state, { type: "setTab", id: "codex" });
  assert.equal(next.searchOpen, false);
  assert.equal(next.searchQuery, "");
  assert.equal(next.listCursor, 0);
});

test("cycleTab clears search state alongside drillStack", () => {
  const state: TuiState = {
    activeTab: "overview",
    drillStack: [],
    result: makeResult([]),
    searchOpen: true,
    searchQuery: "x",
    listCursor: 4,
    actionsCollapsed: []
  };
  const next = tuiReducer(state, {
    type: "cycleTab",
    direction: "next",
    tabs: ["overview", "claude"]
  });
  assert.equal(next.searchOpen, false);
  assert.equal(next.searchQuery, "");
  assert.equal(next.listCursor, 0);
});

test("createInitialState seeds actionsCollapsed=[] (all groups expanded)", () => {
  assert.deepEqual(createInitialState(makeResult([])).actionsCollapsed, []);
});

test("toggleActionsGroup adds then removes a toolId", () => {
  const collapsed = tuiReducer(INITIAL_STATE, {
    type: "toggleActionsGroup",
    toolId: "claude"
  });
  assert.deepEqual(collapsed.actionsCollapsed, ["claude"]);

  const expanded = tuiReducer(collapsed, {
    type: "toggleActionsGroup",
    toolId: "claude"
  });
  assert.deepEqual(expanded.actionsCollapsed, []);
});

test("toggleActionsGroup leaves listCursor untouched", () => {
  const moved = tuiReducer(createInitialState(makeResult([])), {
    type: "listMove",
    direction: "down",
    max: 5
  });
  const toggled = tuiReducer(moved, {
    type: "toggleActionsGroup",
    toolId: "codex"
  });
  assert.equal(toggled.listCursor, moved.listCursor);
});

test("setResult preserves actionsCollapsed (UI preference survives rescan)", () => {
  const collapsed = tuiReducer(createInitialState(makeResult([])), {
    type: "toggleActionsGroup",
    toolId: "gemini"
  });
  const next = tuiReducer(collapsed, {
    type: "setResult",
    result: makeResult(["/p1"])
  });
  assert.deepEqual(next.actionsCollapsed, ["gemini"]);
});

// ── focus pane ────────────────────────────────────────────────────────────────

test("createInitialState defaults focus to 'sidebar'", () => {
  const state = createInitialState(makeResult([]));
  assert.equal(state.focus, "sidebar");
});

test("setFocus moves focus to 'panel' and back to 'sidebar'", () => {
  const base = createInitialState(makeResult([]));
  const toPanel = tuiReducer(base, { type: "setFocus", focus: "panel" });
  assert.equal(toPanel.focus, "panel");
  const toSidebar = tuiReducer(toPanel, { type: "setFocus", focus: "sidebar" });
  assert.equal(toSidebar.focus, "sidebar");
});

test("setTab resets focus to 'panel' even when state had 'sidebar'", () => {
  const base = createInitialState(makeResult([])); // focus: "sidebar"
  const next = tuiReducer(base, { type: "setTab", id: "codex" });
  assert.equal(next.focus, "panel");
});

test("cycleTab resets focus to 'panel'", () => {
  const base = createInitialState(makeResult([])); // focus: "sidebar"
  const next = tuiReducer(base, {
    type: "cycleTab",
    direction: "next",
    tabs: ["overview", "claude", "codex"]
  });
  assert.equal(next.focus, "panel");
});

test("drillIn resets focus to 'panel'", () => {
  const base = createInitialState(makeResult([])); // focus: "sidebar"
  const next = tuiReducer(base, {
    type: "drillIn",
    frame: { kind: "userScope", toolId: "claude" }
  });
  assert.equal(next.focus, "panel");
});

test("drillOut keeps focus unchanged", () => {
  const withStack: TuiState = {
    ...createInitialState(makeResult([])),
    drillStack: [{ kind: "userScope", toolId: "claude" }],
    focus: "panel"
  };
  const next = tuiReducer(withStack, { type: "drillOut" });
  assert.equal(next.focus, "panel");
});
