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
 * Vertical chrome the App always renders around a screen's content:
 * Frame heavy border (top+bottom = 2) + KeyHint footer (1) + IdleWhisper (1).
 * IdleWhisper renders a blank Text even when whisper is null, so it counts.
 * Plus a 1-row safety margin — Ink's flexbox occasionally adds an unexpected
 * row when the frame is sized to the exact terminal height, and overflowing
 * by even 1 row triggers the alt-screen scroll that breaks log-update on the
 * next render. Keep in sync with `App.tsx` MainShell and `ShellWithHints`.
 */
const FRAME_VERTICAL_OVERHEAD = 2;
const KEYHINT_ROWS = 1;
const IDLE_WHISPER_ROWS = 1;
const SAFETY_MARGIN = 1;
/**
 * On non-TTY stdout (CI, piped output, ink-testing-library's mock stdout
 * which exposes columns=100 but no rows getter) there's no viewport to
 * overflow — fall back to a value large enough to keep clipping disabled.
 * Real TTYs always report their actual row count.
 */
const FALLBACK_ROWS = 1000;
const MIN_CONTENT_ROWS = 6;

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

/**
 * Pure helper that computes how many content rows a screen may render before
 * the frame overflows the terminal viewport. Subtracts the App's vertical
 * chrome (Frame border + KeyHint + IdleWhisper) plus an `extraOverhead` for
 * the screen's own fixed-height blocks (section headers, summary lines).
 *
 * Floors at MIN_CONTENT_ROWS so list clipping never collapses to zero on
 * tiny terminals.
 *
 * Why this matters: when a screen renders more rows than fit, the alt-screen
 * buffer scrolls and Ink's log-update mechanism can no longer find the top
 * of its previous frame on the next render — the result is the stacked-frame
 * artifact you see when switching tabs on a too-tall screen.
 */
export function computeAvailableContentRows(rows: number, extraOverhead = 0): number {
  const reserved =
    FRAME_VERTICAL_OVERHEAD +
    KEYHINT_ROWS +
    IDLE_WHISPER_ROWS +
    SAFETY_MARGIN +
    extraOverhead;
  return Math.max(MIN_CONTENT_ROWS, rows - reserved);
}

/**
 * Hook variant of {@link computeAvailableContentRows}. Each screen passes its
 * own fixed-block height as `extraOverhead` so the budget tracks the JSX in
 * the same file — divergence shows up as a single-file diff.
 */
export function useAvailableContentRows(extraOverhead = 0): number {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? FALLBACK_ROWS;
  return computeAvailableContentRows(rows, extraOverhead);
}

/**
 * Single source of truth for the "+N more" hint screens render when they
 * clipped a list to fit the terminal. Returns `null` when nothing was hidden
 * so call sites can spread `{clipHint(n) && <Text>{clipHint(n)}</Text>}`.
 */
export function clipHint(hidden: number): string | null {
  if (hidden <= 0) return null;
  return `    … +${hidden} more (resize terminal to see all)`;
}
