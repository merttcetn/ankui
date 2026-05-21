import { useStdout } from "ink";

/**
 * Layout invariants the hook subtracts to compute the panel content width.
 * Keep in sync with App.tsx's two-column layout and Sidebar's fixed width.
 *
 * - FRAME_OVERHEAD: outer Frame's heavy border (left+right = 2) + paddingX=1 (2).
 * - SIDEBAR_WIDTH: matches Sidebar.tsx's SIDEBAR_WIDTH (22).
 * - PANEL_PADDING_LEFT: the right column's paddingLeft={2} in MainShell.
 */
const FRAME_OVERHEAD = 4;
const SIDEBAR_WIDTH = 22;
const PANEL_PADDING_LEFT = 2;
const FALLBACK_COLUMNS = 80;
const MIN_PANEL_WIDTH = 32;

/**
 * Pure helper that computes the content width inside MainShell's right panel
 * given a terminal column count. Exposed for unit testing — the hook below
 * just plugs the live `stdout.columns` value into this formula.
 *
 * Floors at 32 cols so SectionHeader / DotLeaderRow never compress into
 * something illegible on a narrow window.
 */
export function computePanelWidth(columns: number): number {
  const available = columns - FRAME_OVERHEAD - SIDEBAR_WIDTH - PANEL_PADDING_LEFT;
  return Math.max(MIN_PANEL_WIDTH, available);
}

/**
 * Returns the available content width inside MainShell's right panel.
 * Read via Ink's useStdout — on non-TTY stdout (CI, piped output, tests)
 * defaults to 80 cols which matches the developer's typical terminal.
 */
export function usePanelWidth(): number {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? FALLBACK_COLUMNS;
  return computePanelWidth(columns);
}
