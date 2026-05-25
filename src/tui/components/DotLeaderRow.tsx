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
  /** Optional origin label appended after metadata as dim italic. */
  originLabel?: string;
}

/**
 * Renders one row of `<label> · · · · · <metadata>` padded to exactly `width`
 * characters wide. When `active`, prepends `▶ ` and tints the prefix +
 * label with the accent color. When `originLabel` is set and non-empty,
 * a dim italic suffix is appended after the metadata (separated by a single
 * space) and counted against the reserved width.
 */
export function DotLeaderRow({
  label,
  metadata,
  width,
  active = false,
  originLabel
}: DotLeaderRowProps): React.ReactElement {
  const prefix = active ? `${ACTIVE_PREFIX} ` : "";
  const originSuffix =
    originLabel && originLabel.length > 0 ? ` ${originLabel}` : "";
  const reserved =
    prefix.length + label.length + metadata.length + originSuffix.length;
  const gap = Math.max(0, width - reserved);
  const leader = buildLeader(gap);

  return (
    <Box width="100%">
      {active ? <Text color={ACCENT}>{prefix}</Text> : null}
      <Text color={active ? ACCENT : undefined}>{label}</Text>
      <Text dimColor>{leader}</Text>
      <Text>{metadata}</Text>
      {originSuffix.length > 0 ? (
        <Text dimColor italic>
          {originSuffix}
        </Text>
      ) : null}
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
