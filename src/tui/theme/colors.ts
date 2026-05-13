import type { AccessLevel } from "../../types.js";

/**
 * The fixed palette the Archive Inspector aesthetic uses.
 *
 * `undefined` = use the terminal's default foreground color. This is the
 * intentional value for "Limited" access — we don't tint normal rows.
 */
export type Color = "cyan" | "red" | "white" | "gray" | undefined;

export const ACCENT: Color = "cyan";
export const STATUS_BROAD: Color = "red";
export const STATUS_MODERATE: Color = "cyan";
export const STATUS_LIMITED: Color = undefined;
export const STATUS_UNKNOWN: Color = "gray";

export function colorForAccessLevel(level: AccessLevel): Color {
  switch (level) {
    case "broad":
      return STATUS_BROAD;
    case "moderate":
      return STATUS_MODERATE;
    case "limited":
      return STATUS_LIMITED;
    case "unknown":
      return STATUS_UNKNOWN;
  }
}
