import React from "react";
import { Box, Text } from "ink";

import { SECTION_UNDERLINE } from "../theme/icons.js";
import { repeat } from "../theme/borders.js";

export interface SectionHeaderProps {
  /** Plain label (any case). Will be uppercased and spaced. */
  label: string;
  /** Length of the underline rule in characters. Default 60. */
  underlineWidth?: number;
}

/**
 * Spaces every glyph in the uppercased label so `overview` → `O V E R V I E W`.
 * Used as the section divider in every screen.
 */
export function SectionHeader({
  label,
  underlineWidth = 60
}: SectionHeaderProps): React.ReactElement {
  const spaced = Array.from(label.toUpperCase()).join(" ");
  const rule = repeat(SECTION_UNDERLINE, underlineWidth);
  return (
    <Box flexDirection="column">
      <Text bold>{spaced}</Text>
      <Text dimColor>{rule}</Text>
    </Box>
  );
}
