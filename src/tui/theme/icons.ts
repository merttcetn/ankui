/**
 * Glyphs that carry semantic meaning in the Archive Inspector aesthetic.
 * Components import from here so changing a symbol happens in one place.
 */

/** Disclosure markers. */
export const DISCLOSURE_OPEN = "◆"; // ◆
export const DISCLOSURE_CLOSED = "◇"; // ◇

/** Active-row prefix used by drill-in lists. */
export const ACTIVE_PREFIX = "▶"; // ▶

/** Actions-tab agent group disclosure markers. */
export const GROUP_EXPANDED = "▾"; // ▾
export const GROUP_COLLAPSED = "▸"; // ▸

/** First-run splash logo glyph. */
export const SPLASH_DOT = "◌"; // ◌

/** Editorial slash for the breadcrumb (NOT ASCII /). */
export const BREADCRUMB_SLASH = "╱"; // ╱

/** Status pill bullet. */
export const STATUS_DOT = "●"; // ●

/** Dot-leader filler. Used between name and metadata in DotLeaderRow. */
export const DOT_LEADER = "·"; // ·

/** Section underline glyph (light horizontal). */
export const SECTION_UNDERLINE = "─"; // ─

/** Spinner: ten braille frames, rotated by parent at ~100ms cadence. */
export const SPINNER_FRAMES = [
  "⠋", // ⠋
  "⠙", // ⠙
  "⠹", // ⠹
  "⠸", // ⠸
  "⠼", // ⠼
  "⠴", // ⠴
  "⠦", // ⠦
  "⠧", // ⠧
  "⠇", // ⠇
  "⠏"  // ⠏
] as const;

export type SpinnerFrame = (typeof SPINNER_FRAMES)[number];

/**
 * Progress bar characters. Index = number of eighth-cells filled (0..8).
 * `PROGRESS_FULL` is the spec-mandated dominant glyph (▊ = 6/8).
 * Sub-cell rendering: total eighths = floor(value * width * 8).
 */
export const PROGRESS_EIGHTHS = [
  "░", // ░ 0/8 — empty
  "▏", // ▏ 1/8
  "▎", // ▎ 2/8
  "▍", // ▍ 3/8
  "▌", // ▌ 4/8
  "▋", // ▋ 5/8
  "▊", // ▊ 6/8
  "▉", // ▉ 7/8
  "█"  // █ 8/8
] as const;

export const PROGRESS_EMPTY = PROGRESS_EIGHTHS[0]; // "░"
export const PROGRESS_FULL = PROGRESS_EIGHTHS[6]; // "▊" — spec-mandated dominant glyph
