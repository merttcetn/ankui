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
 * Footer line of dim key bindings. The separator is the `·` interpunct (the
 * same glyph used for dot leaders) wrapped with single spaces.
 */
export function KeyHint({ hints }: KeyHintProps): React.ReactElement {
  const separator = ` ${DOT_LEADER} `;
  return (
    <Box width="100%">
      <Text dimColor>{hints.join(separator)}</Text>
    </Box>
  );
}
