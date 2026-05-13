import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_STATE,
  tuiReducer,
  type DrillFrame,
  type TuiState
} from "../../../src/tui/state/tui-state.js";
import { cycleTabId } from "../../../src/tui/state/navigation.js";

const TABS = ["overview", "claude", "codex", "cursor"] as const;

test("INITIAL_STATE has activeTab='overview' and empty drillStack", () => {
  assert.equal(INITIAL_STATE.activeTab, "overview");
  assert.deepEqual(INITIAL_STATE.drillStack, []);
});

test("setTab replaces activeTab and clears drillStack", () => {
  const state: TuiState = {
    activeTab: "overview",
    drillStack: [{ kind: "userScope", toolId: "claude" }]
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
    ]
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
