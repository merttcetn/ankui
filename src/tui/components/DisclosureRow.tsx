import React, { type ReactNode } from "react";
import { Box, Text } from "ink";

import { DISCLOSURE_CLOSED, DISCLOSURE_OPEN } from "../theme/icons.js";

export interface DisclosureRowProps {
  /** Label after the disclosure marker, e.g., "user scope". */
  label: string;
  /** Whether the disclosure is open. Controlled by parent. */
  open: boolean;
  /** Optional right-aligned summary text (e.g., `"[82]"`). */
  rightSummary?: string;
  /** Content revealed when `open` is true. Hidden when closed. */
  children?: ReactNode;
}

/**
 * Controlled disclosure row. Parent owns the open/closed state; this
 * component is purely visual. When open, children render below the row;
 * when closed, they are omitted entirely.
 */
export function DisclosureRow({
  label,
  open,
  rightSummary,
  children
}: DisclosureRowProps): React.ReactElement {
  const marker = open ? DISCLOSURE_OPEN : DISCLOSURE_CLOSED;
  return (
    <Box flexDirection="column">
      <Box width="100%">
        <Text bold>{marker} </Text>
        <Text bold>{label}</Text>
        {rightSummary !== undefined && (
          <Box flexGrow={1} justifyContent="flex-end">
            <Text dimColor>{rightSummary}</Text>
          </Box>
        )}
      </Box>
      {open && children !== undefined && children !== null ? (
        <Box flexDirection="column" paddingLeft={2}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
}
