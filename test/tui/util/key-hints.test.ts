import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
    ...overrides
  };
}

describe("deriveKeyHints", () => {
  it("includes ⏎ open on tool tabs where Enter drills in", () => {
    const hints = deriveKeyHints(baseState({ activeTab: "overview" }));
    assert.deepEqual(hints, ["←→ tabs", "⏎ open", "r rescan", "q quit"]);
  });

  it("includes ⏎ open on per-tool tabs (claude, codex, …)", () => {
    const hints = deriveKeyHints(baseState({ activeTab: "claude" }));
    assert.ok(hints.includes("⏎ open"));
  });

  it("omits ⏎ open on cross-tool tabs where Enter is a no-op (mcps/doctor/settings)", () => {
    for (const tab of ["mcps", "doctor", "settings"] as const) {
      const hints = deriveKeyHints(baseState({ activeTab: tab }));
      assert.equal(
        hints.includes("⏎ open"),
        false,
        `expected no ⏎ open hint on ${tab} tab`
      );
      assert.deepEqual(hints, ["←→ tabs", "r rescan", "q quit"]);
    }
  });

  it("exposes ↑↓ next finding on the access tab (card-paginated scroll)", () => {
    const hints = deriveKeyHints(baseState({ activeTab: "access" }));
    assert.deepEqual(hints, [
      "←→ tabs",
      "↑↓ next finding",
      "r rescan",
      "q quit"
    ]);
  });

  it("swaps to scroll/search/back hints when a drill-in screen is active", () => {
    const hints = deriveKeyHints(
      baseState({
        activeTab: "claude",
        drillStack: [{ kind: "userScope", toolId: "claude" }]
      })
    );
    assert.deepEqual(hints, [
      "↑↓ scroll",
      "/ search",
      "esc back",
      "r rescan",
      "q quit"
    ]);
  });

  it("swaps to input hints when the search overlay is open inside a drill-in", () => {
    const hints = deriveKeyHints(
      baseState({
        activeTab: "claude",
        drillStack: [{ kind: "userScope", toolId: "claude" }],
        searchOpen: true,
        searchQuery: "auto"
      })
    );
    assert.deepEqual(hints, ["⌫ delete", "esc close", "r rescan", "q quit"]);
  });

  it("FIRST_RUN_KEY_HINTS exposes confirm/cancel/quit", () => {
    assert.deepEqual(FIRST_RUN_KEY_HINTS, ["⏎ confirm", "esc cancel", "q quit"]);
  });
});
