import type { Skill } from "../../types.js";
import { isBundleOrigin } from "../../utils/skill-groups.js";
import type { PillVariant } from "../components/Pill.js";

/**
 * Maps a skill's bundle origin to the pill variant + label used in the editorial
 * web UI. Falls back to a muted "OTHER" pill when bundleOrigin is missing or has
 * an unrecognised kind. Type-safe via the existing `isBundleOrigin` guard from
 * `src/utils/skill-groups.ts` — no `as` casts.
 */
export function originPill(skill: Skill): { variant: PillVariant; label: string } {
  const origin = skill.details?.bundleOrigin;
  if (!isBundleOrigin(origin)) return { variant: "muted", label: "OTHER" };
  switch (origin.kind) {
    case "bundle":   return { variant: "bundle", label: "BUNDLE" };
    case "builtin":  return { variant: "builtin", label: "BUILTIN" };
    case "yours":    return { variant: "yours", label: "YOURS" };
    case "plugin":   return { variant: "info", label: "PLUGIN" };
    case "external": return { variant: "warn", label: "EXTERNAL" };
  }
}
