/**
 * Shared windowing helpers for cursor-bounded scroll viewports.
 *
 * Two consumers today: `SkillViewport` (line-row scrolling) and
 * `AccessViewport` (card-row scrolling). Same math, same edge cases —
 * keeping the logic in one place ensures both viewports behave identically
 * around the start/end clamps.
 */

/**
 * Returns the starting index of a window of `visibleCount` rows that
 * brackets `cursor`, clamped so the window never extends past either end
 * of a `total`-row list.
 */
export function windowStart(
  cursor: number,
  total: number,
  visibleCount: number
): number {
  if (total <= visibleCount) return 0;
  const preferred = cursor - Math.floor(visibleCount / 2);
  return Math.max(0, Math.min(total - visibleCount, preferred));
}

/**
 * Returns `cursor` clamped to a valid index in a list of `total` rows.
 * Empty lists collapse to 0.
 */
export function clampCursor(cursor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, cursor));
}
