import assert from "node:assert/strict";
import test from "node:test";

import { deriveKeyHints, FIRST_RUN_KEY_HINTS } from "../../../src/tui/util/key-hints.js";
import type { TuiState } from "../../../src/tui/state/tui-state.js";

function baseState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    activeTab: "overview",
    drillStack: [],
    result: {} as any,
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: [],
    focus: "sidebar",
    ...overrides
  };
}

test("deriveKeyHints includes ⏎ open on tool tabs where Enter drills in", () => {
  const hints = deriveKeyHints(
    baseState({ activeTab: "overview" }),
    { canRefresh: true }
  );
  assert.deepEqual(hints, ["↑↓ select", "→ focus panel", "⏎ open", "r rescan", "q quit"]);
});

test("deriveKeyHints includes ⏎ open on per-tool tabs (claude, codex, …)", () => {
  const hints = deriveKeyHints(
    baseState({ activeTab: "claude" }),
    { canRefresh: true }
  );
  assert.ok(hints.includes("⏎ open"));
  assert.ok(hints.includes("↑↓ select"));
});

test("deriveKeyHints omits ⏎ open on cross-tool tabs where Enter is a no-op (mcps/doctor/settings)", () => {
  for (const tab of ["mcps", "doctor", "settings"] as const) {
    const hints = deriveKeyHints(
      baseState({ activeTab: tab, focus: "panel" }),
      { canRefresh: true }
    );
    assert.equal(
      hints.includes("⏎ open"),
      false,
      `expected no ⏎ open hint on ${tab} tab`
    );
    assert.deepEqual(hints, ["← sidebar", "r rescan", "q quit"]);
  }
});

test("deriveKeyHints exposes ↑↓ next finding on the access tab (card-paginated scroll)", () => {
  const hints = deriveKeyHints(
    baseState({ activeTab: "access", focus: "panel" }),
    { canRefresh: true }
  );
  assert.deepEqual(hints, [
    "↑↓ next finding",
    "← sidebar",
    "r rescan",
    "q quit"
  ]);
});

test("deriveKeyHints swaps to scroll/search/back hints when a drill-in screen is active", () => {
  const hints = deriveKeyHints(
    baseState({
      activeTab: "claude",
      drillStack: [{ kind: "userScope", toolId: "claude" }]
    }),
    { canRefresh: true }
  );
  assert.deepEqual(hints, [
    "↑↓ scroll",
    "/ search",
    "esc back",
    "r rescan",
    "q quit"
  ]);
});

test("deriveKeyHints swaps to input hints when the search overlay is open inside a drill-in", () => {
  const hints = deriveKeyHints(
    baseState({
      activeTab: "claude",
      drillStack: [{ kind: "userScope", toolId: "claude" }],
      searchOpen: true,
      searchQuery: "auto"
    }),
    { canRefresh: true }
  );
  assert.deepEqual(hints, ["⌫ delete", "esc close", "r rescan", "q quit"]);
});

test("deriveKeyHints omits 'r rescan' when canRefresh is false or context is missing", () => {
  // Covers `ankui watch` mode (no LauncherShell injection) plus test fixtures
  // that mount App with `result` directly — in both cases pressing `r` is a
  // no-op and the bar must not advertise it.
  const cases: Array<{ label: string; state: TuiState }> = [
    { label: "overview", state: baseState({ activeTab: "overview" }) },
    { label: "claude tab", state: baseState({ activeTab: "claude" }) },
    { label: "mcps tab", state: baseState({ activeTab: "mcps" }) },
    { label: "access tab", state: baseState({ activeTab: "access" }) },
    {
      label: "drill-in",
      state: baseState({
        activeTab: "claude",
        drillStack: [{ kind: "userScope", toolId: "claude" }]
      })
    },
    {
      label: "drill-in + search open",
      state: baseState({
        activeTab: "claude",
        drillStack: [{ kind: "userScope", toolId: "claude" }],
        searchOpen: true,
        searchQuery: "x"
      })
    }
  ];

  for (const { label, state } of cases) {
    const undefinedCtx = deriveKeyHints(state);
    const falseCtx = deriveKeyHints(state, { canRefresh: false });
    assert.equal(
      undefinedCtx.includes("r rescan"),
      false,
      `expected no 'r rescan' hint on ${label} when ctx is undefined`
    );
    assert.equal(
      falseCtx.includes("r rescan"),
      false,
      `expected no 'r rescan' hint on ${label} when canRefresh is false`
    );
  }
});

test("FIRST_RUN_KEY_HINTS exposes confirm/cancel/quit", () => {
  assert.deepEqual(FIRST_RUN_KEY_HINTS, ["⏎ confirm", "esc cancel", "q quit"]);
});

test("deriveKeyHints exposes ↑↓/[d]/[e] hotkeys on the Actions tab", () => {
  const withRefresh = deriveKeyHints(
    baseState({ activeTab: "actions", focus: "panel" }),
    { canRefresh: true }
  );
  assert.deepEqual(withRefresh, [
    "↑↓ select",
    "← sidebar",
    "[d] disable",
    "[e] enable",
    "r rescan",
    "q quit"
  ]);

  const withoutRefresh = deriveKeyHints(
    baseState({ activeTab: "actions", focus: "panel" })
  );
  assert.deepEqual(withoutRefresh, [
    "↑↓ select",
    "← sidebar",
    "[d] disable",
    "[e] enable",
    "q quit"
  ]);
});

test("deriveKeyHints with focus='sidebar' shows ↑↓ select / → focus panel / ⏎ open regardless of tab", () => {
  for (const tab of ["overview", "claude", "mcps", "actions", "settings"] as const) {
    const hints = deriveKeyHints(
      baseState({ activeTab: tab, focus: "sidebar" })
    );
    assert.deepEqual(hints, ["↑↓ select", "→ focus panel", "⏎ open", "q quit"]);
  }
});

test("deriveKeyHints with focus='panel' on a tool tab swaps ←→ tabs for ← sidebar and keeps ⏎ open", () => {
  const hints = deriveKeyHints(
    baseState({ activeTab: "claude", focus: "panel" })
  );
  assert.deepEqual(hints, ["↑↓ scroll", "← sidebar", "⏎ open", "q quit"]);
});

test("deriveKeyHints drill-in branch ignores focus (renders the same regardless)", () => {
  for (const focus of ["sidebar", "panel"] as const) {
    const hints = deriveKeyHints(
      baseState({
        activeTab: "claude",
        drillStack: [{ kind: "userScope", toolId: "claude" }],
        focus
      })
    );
    assert.deepEqual(hints, ["↑↓ scroll", "/ search", "esc back", "q quit"]);
  }
});
