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
 * Hints are state-aware around two axes: drill-in/search overlays take
 * precedence over everything else, and within the top-level frame the
 * footer pivots on `state.focus`:
 *
 * - Drill-in (`state.drillStack.length > 0`) — unchanged regardless of
 *   focus. Shows scroll/search/back, or the search-input controls when
 *   the overlay is open.
 * - Sidebar focus (`state.focus === "sidebar"`) — the user is browsing
 *   the left sidebar. Shows ↑↓ select / → focus panel / ⏎ open on every
 *   tab; tab-specific hotkeys belong to the panel and stay hidden here.
 * - Panel focus (`state.focus === "panel"`) — screen-specific hints
 *   driven by `state.activeTab`. `← sidebar` replaces the old `←→ tabs`
 *   hint (the sidebar is now the navigation surface). Cross-tool tabs
 *   (mcps/doctor/settings) expose only the back hint; the access tab
 *   surfaces ↑↓ next finding; the actions tab surfaces ↑↓/[d]/[e];
 *   tool tabs (overview + per-tool) surface ↑↓ scroll / ⏎ open.
 *
 * `r rescan` is gated on `ctx.canRefresh` so the bar never advertises
 * a key that would be a no-op.
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

  if (state.focus === "sidebar") {
    return ["↑↓ select", "→ focus panel", "⏎ open", ...r, "q quit"];
  }

  // focus === "panel" — screen-specific hints
  const back = "← sidebar";

  if (state.activeTab === "access") {
    return ["↑↓ next finding", back, ...r, "q quit"];
  }

  if (state.activeTab === "actions") {
    return ["↑↓ select", back, "[d] disable", "[e] enable", ...r, "q quit"];
  }

  if (state.activeTab === "changes") {
    return ["tab from/to", "↑↓ select", "[n] snapshot", "[d] delete", back, ...r, "q quit"];
  }

  if (
    state.activeTab === "mcps" ||
    state.activeTab === "doctor" ||
    state.activeTab === "settings"
  ) {
    return [back, ...r, "q quit"];
  }

  // Tool tabs (Overview + Claude/Codex/...) — Enter opens drill-in.
  return ["↑↓ scroll", back, "⏎ open", ...r, "q quit"];
}

/** Hints shown in the first-run dev-root picker. */
export const FIRST_RUN_KEY_HINTS: ReadonlyArray<string> = [
  "⏎ confirm",
  "esc cancel",
  "q quit"
];
