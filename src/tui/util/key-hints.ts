import type { TuiState } from "../state/tui-state.js";

/**
 * Derives the dim hint row shown beneath the Frame.
 *
 * The bar lives OUTSIDE the heavy border and uses the same interpunct
 * separator + dimColor as IdleWhisper, so the controls read as a quiet
 * editorial footer rather than chrome competing with the content.
 *
 * Hints are state-aware: drill-in screens expose scroll/search/back,
 * cross-tool tabs hide ⏎ (Enter is a no-op there), and the search overlay
 * swaps navigation for input controls.
 */
export function deriveKeyHints(state: TuiState): ReadonlyArray<string> {
  if (state.drillStack.length > 0) {
    if (state.searchOpen) {
      return ["⌫ delete", "esc close", "r rescan", "q quit"];
    }
    return ["↑↓ scroll", "/ search", "esc back", "r rescan", "q quit"];
  }

  if (state.activeTab === "access") {
    return ["←→ tabs", "↑↓ next finding", "r rescan", "q quit"];
  }

  if (
    state.activeTab === "mcps" ||
    state.activeTab === "doctor" ||
    state.activeTab === "settings"
  ) {
    return ["←→ tabs", "r rescan", "q quit"];
  }

  return ["←→ tabs", "⏎ open", "r rescan", "q quit"];
}

/** Hints shown in the first-run dev-root picker. */
export const FIRST_RUN_KEY_HINTS: ReadonlyArray<string> = [
  "⏎ confirm",
  "esc cancel",
  "q quit"
];
