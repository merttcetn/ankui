import React from "react";
import { Text } from "ink";

import type { AccessLevel } from "../../types.js";
import { colorForAccessLevel } from "../theme/colors.js";
import { DOT_LEADER, STATUS_DOT } from "../theme/icons.js";

export interface StatusPillProps {
  /** Capability label, e.g., "database". */
  label: string;
  /** Access level — drives the color of the pill. */
  accessLevel: AccessLevel;
}

/**
 * Inline `● label · level` pill. Color comes from `colorForAccessLevel`.
 * `unknown` renders dim italic per the spec's color palette.
 */
export function StatusPill({
  label,
  accessLevel
}: StatusPillProps): React.ReactElement {
  const color = colorForAccessLevel(accessLevel);
  const dim = accessLevel === "unknown";
  const italic = accessLevel === "unknown";

  return (
    <Text color={color} dimColor={dim} italic={italic}>
      {STATUS_DOT} {label} {DOT_LEADER} {accessLevel}
    </Text>
  );
}
