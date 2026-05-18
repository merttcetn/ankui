import React from "react";
import { Box, Text } from "ink";

import { DOT_LEADER } from "../theme/icons.js";

export interface KeyHintProps {
  /**
   * Ordered list of hints. Each one already includes its glyph(s), e.g.
   * `"▲▼ navigate"`, `"⏎ open"`, `"esc back"`.
   */
  hints: ReadonlyArray<string>;
}

/**
 * Footer line of dim key bindings, rendered BELOW the Frame (outside the
 * heavy border) at bottom-left. The separator is the `·` interpunct — same
 * glyph as DotLeaderRow and IdleWhisper, so the row reads as part of the
 * Archive Inspector typographic system rather than as chrome.
 *
 * `paddingLeft={1}` insets the row by one cell so the first glyph sits under
 * the first body column of the Frame (which itself has `paddingX={1}`),
 * giving the bar a visible attachment to the frame above it without drawing
 * any connector glyphs.
 */
export function KeyHint({ hints }: KeyHintProps): React.ReactElement {
  const separator = ` ${DOT_LEADER} `;
  return (
    <Box width="100%" paddingLeft={1}>
      <Text dimColor>{hints.join(separator)}</Text>
    </Box>
  );
}
