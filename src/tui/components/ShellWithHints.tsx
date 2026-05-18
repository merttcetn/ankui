import React from "react";
import { Box } from "ink";

import { Frame } from "./Frame.js";
import { KeyHint } from "./KeyHint.js";

export interface ShellWithHintsProps {
  hints: ReadonlyArray<string>;
  children: React.ReactNode;
}

/**
 * Wraps screen content in the Archive Inspector frame with a dim key-hint
 * footer below the heavy border. The bar sits OUTSIDE the frame so it
 * reads as an editorial footer rather than chrome, matching the same
 * interpunct/dimColor system as DotLeaderRow and IdleWhisper.
 */
export function ShellWithHints({
  hints,
  children
}: ShellWithHintsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Frame>{children}</Frame>
      <KeyHint hints={hints} />
    </Box>
  );
}
