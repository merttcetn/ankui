import React from "react";
import { Box, Text } from "ink";

import { ACTIVE_PREFIX, DOT_LEADER } from "../theme/icons.js";
import { ACCENT } from "../theme/colors.js";

export interface DotLeaderRowProps {
  /** Left-side label. */
  label: string;
  /** Right-side metadata text. */
  metadata: string;
  /** Total row width (characters). */
  width: number;
  /** When true, prefix with ▶ and tint the label cyan. Default false. */
  active?: boolean;
}

/**
 * Renders one row of `<label> · · · · · <metadata>` padded to exactly `width`
 * characters wide. When `active`, prepends `▶ ` and tints the prefix +
 * label with the accent color.
 */
export function DotLeaderRow({
  label,
  metadata,
  width,
  active = false
}: DotLeaderRowProps): React.ReactElement {
  const prefix = active ? `${ACTIVE_PREFIX} ` : "";
  const reserved = prefix.length + label.length + metadata.length;
  const gap = Math.max(0, width - reserved);
  const leader = buildLeader(gap);

  return (
    <Box width="100%">
      {active ? <Text color={ACCENT}>{prefix}</Text> : null}
      <Text color={active ? ACCENT : undefined}>{label}</Text>
      <Text dimColor>{leader}</Text>
      <Text>{metadata}</Text>
    </Box>
  );
}

/**
 * Builds a dot-leader string of length `gap`.
 *
 * - If `gap < 3` we can't fit ` · `, so emit `gap` spaces (graceful narrow
 *   terminal fallback).
 * - Otherwise emit a leading space, then alternating `· ` pairs, padding
 *   the tail with spaces if needed to match exactly `gap` characters.
 */
function buildLeader(gap: number): string {
  if (gap <= 0) return "";
  if (gap < 3) return " ".repeat(gap);

  const dots = Math.floor((gap - 1) / 2);
  const trailing = gap - 1 - dots * 2;
  return " " + `${DOT_LEADER} `.repeat(dots) + " ".repeat(trailing);
}
