import type { BundleKind, BundleOrigin } from "../scanner/bundle-origin.js";
import type { Skill } from "../types.js";

export interface SkillGroup {
  origin: BundleOrigin;
  skills: Skill[];
  /** true ONLY for the "yours" group; all other kinds default to collapsed. */
  alwaysExpanded: boolean;
  /** "Your skills" for kind === "yours"; otherwise `${name} · ${kind}`. */
  label: string;
}

const DEFAULT_ORIGIN: BundleOrigin = { kind: "yours", name: "yours" };

// Kind ordering: yours → bundle → plugin → builtin → external
const KIND_ORDER: Record<BundleKind, number> = {
  yours: 0,
  bundle: 1,
  plugin: 2,
  builtin: 3,
  external: 4
};

/**
 * Group skills by their `details.bundleOrigin` (kind + name tuple).
 *
 * Behavior:
 *  - Skills missing `details.bundleOrigin` are defensively treated as
 *    `{ kind: "yours", name: "yours" }`.
 *  - Two bundles with the same name but different kind do NOT merge — a bundle
 *    named "claude" and a builtin for "claude" produce separate groups.
 *  - Skill order within each group preserves input order (stable grouping).
 *  - Each group's `origin` is taken from the first skill of that group, so
 *    `rootPath` is preserved when present.
 *  - Group ordering: yours first, then bundle, plugin, builtin, external —
 *    alphabetical (case-insensitive) within each kind. The "yours" group is
 *    only emitted when there is at least one matching skill.
 *  - `alwaysExpanded` is `true` if and only if `origin.kind === "yours"`.
 */
export function groupSkillsByOrigin(skills: readonly Skill[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();

  for (const skill of skills) {
    const origin = readOrigin(skill);
    const key = `${origin.kind} ${origin.name}`;

    const existing = groups.get(key);
    if (existing) {
      existing.skills.push(skill);
      continue;
    }

    groups.set(key, {
      origin,
      skills: [skill],
      alwaysExpanded: origin.kind === "yours",
      label: formatLabel(origin)
    });
  }

  return [...groups.values()].sort(compareGroups);
}

function readOrigin(skill: Skill): BundleOrigin {
  const candidate = skill.details?.bundleOrigin;
  if (isBundleOrigin(candidate)) {
    return candidate;
  }
  return DEFAULT_ORIGIN;
}

export function isBundleOrigin(value: unknown): value is BundleOrigin {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as { kind?: unknown; name?: unknown };
  return (
    typeof record.kind === "string" &&
    typeof record.name === "string" &&
    record.kind in KIND_ORDER
  );
}

function formatLabel(origin: BundleOrigin): string {
  if (origin.kind === "yours") {
    return "Your skills";
  }
  return `${origin.name} · ${origin.kind}`;
}

function compareGroups(a: SkillGroup, b: SkillGroup): number {
  const kindDelta = KIND_ORDER[a.origin.kind] - KIND_ORDER[b.origin.kind];
  if (kindDelta !== 0) {
    return kindDelta;
  }
  return a.origin.name.localeCompare(b.origin.name, undefined, { sensitivity: "base" });
}

/**
 * Inline origin label for individual skill rows (TUI drill-ins, web McpsView).
 * Returns undefined when origin is missing or kind === "yours" — those rows
 * should not show a suffix because "yours" is the implicit default.
 */
export function formatInlineOriginLabel(
  origin: BundleOrigin | undefined
): string | undefined {
  if (!origin || origin.kind === "yours") return undefined;
  return `${origin.name} · ${origin.kind}`;
}
