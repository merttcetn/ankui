import type { TuiState } from "../state/tui-state.js";

export interface KeyHintsContext {
  /** True when the shell exposes a refresh callback that `r` can invoke
   *  (LauncherShell sets this; watch-mode dataSource does not). */
  canRefresh: boolean;
}

/**
 * Derives the dim hint row shown beneath the Frame.
 *
 * The bar lives OUTSIDE the heavy border and uses the same interpunct
 * separator + dimColor as IdleWhisper, so the controls read as a quiet
 * editorial footer rather than chrome competing with the content.
 *
 * Hints are state-aware: drill-in screens expose scroll/search/back,
 * cross-tool tabs hide ⏎ (Enter is a no-op there), the access tab swaps
 * ⏎ for ↑↓ (card-paginated finding scroll), and the search overlay swaps
 * navigation for input controls. `r rescan` is gated on `ctx.canRefresh`
 * so the bar never advertises a key that would be a no-op.
 */
export function deriveKeyHints(
  state: TuiState,
  ctx?: KeyHintsContext
): ReadonlyArray<string> {
  const r = ctx?.canRefresh ? ["r rescan"] : [];

  if (state.drillStack.length > 0) {
    if (state.searchOpen) {
      return ["⌫ delete", "esc close", ...r, "q quit"];
    }
    return ["↑↓ scroll", "/ search", "esc back", ...r, "q quit"];
  }

  if (state.activeTab === "access") {
    return ["←→ tabs", "↑↓ next finding", ...r, "q quit"];
  }

  if (
    state.activeTab === "mcps" ||
    state.activeTab === "doctor" ||
    state.activeTab === "settings"
  ) {
    return ["←→ tabs", ...r, "q quit"];
  }

  return ["←→ tabs", "⏎ open", ...r, "q quit"];
}

/** Hints shown in the first-run dev-root picker. */
export const FIRST_RUN_KEY_HINTS: ReadonlyArray<string> = [
  "⏎ confirm",
  "esc cancel",
  "q quit"
];
