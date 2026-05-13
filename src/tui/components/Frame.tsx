import React, { type ReactNode } from "react";
import { Box, Text } from "ink";

import { HEAVY } from "../theme/borders.js";

export interface FrameProps {
  children?: ReactNode;
}

/**
 * Outer heavy box drawing. Uses Ink's `borderStyle="bold"` for the heavy
 * variant — Ink maps that to ┏ ┓ ┗ ┛ ━ ┃ which is exactly what the
 * Archive Inspector spec requires.
 *
 * The Frame stretches to fill the available width (`width="100%"`) so
 * callers can drop it into a full-screen layout without computing terminal
 * columns.
 */
export function Frame({ children }: FrameProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="bold"
      borderColor={undefined}
      paddingX={1}
    >
      {children ?? <Text> </Text>}
    </Box>
  );
}

// `HEAVY` is intentionally imported even though Ink's borderStyle="bold"
// already produces the same glyphs — the import keeps the theme module the
// single source of truth and helps future maintainers find the box characters.
void HEAVY;
