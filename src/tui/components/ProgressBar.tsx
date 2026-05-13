import React from "react";
import { Text } from "ink";

import { PROGRESS_EIGHTHS, PROGRESS_EMPTY, PROGRESS_FULL } from "../theme/icons.js";

export interface ProgressBarProps {
  /** Fill ratio in [0..1]. Values outside that range are clamped. */
  value: number;
  /** Total bar width in cells. */
  width: number;
}

/**
 * Renders a block-character progress bar with eighth-cell precision.
 *
 *   ▊▊▊▊▊▊▊▊▊▊▊▊▏░░░░░░░░░░░░░  (12 full + 1 partial + 13 empty = 26 wide)
 *
 * The bulk-fill glyph is ▊ (6/8) per spec; the partial uses any of the
 * eighths glyphs depending on the leftover; empty is ░.
 */
export function ProgressBar({
  value,
  width
}: ProgressBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(1, value));
  const totalEighths = Math.floor(clamped * width * 8);
  const fullCells = Math.floor(totalEighths / 8);
  const partialEighths = totalEighths - fullCells * 8;
  const hasPartial = partialEighths > 0;
  const emptyCells = Math.max(0, width - fullCells - (hasPartial ? 1 : 0));

  const bar =
    PROGRESS_FULL.repeat(fullCells) +
    (hasPartial ? PROGRESS_EIGHTHS[partialEighths] : "") +
    PROGRESS_EMPTY.repeat(emptyCells);

  return <Text>{bar}</Text>;
}
