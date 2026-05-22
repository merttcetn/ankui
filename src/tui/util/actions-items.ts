/**
 * Navigable-item model for the Actions tab.
 *
 * The Actions tab groups markdown-backed user-scope skills under a header per
 * agent (`toolId`). The cursor moves over a single sequence of *navigable*
 * items: every agent header (always present), plus that agent's skills when its
 * group is expanded. Empty-group `(none)` placeholders are render-only and are
 * deliberately excluded from `items[]` so the cursor can never land on one.
 *
 * `tui-state` owns the collapsed-set so cursor clamping (`getListMax`) and the
 * `ActionsTab` render stay in agreement; both go through this builder.
 */

import type { MultiProjectScanResult, Skill, ToolId } from "../../types.js";

export type ActionsItem =
  | {
      type: "header";
      toolId: ToolId;
      name: string;
      enabled: number;
      disabled: number;
      collapsed: boolean;
      empty: boolean;
    }
  | { type: "skill"; skill: Skill; toolId: ToolId };

export interface ActionsModel {
  /** Cursor-navigable sequence: headers (always) + skills (only if expanded). */
  items: ActionsItem[];
  /** Per toolId: whether to render a `(none)` line under its (expanded) header. */
  noneAfter: ReadonlyMap<ToolId, boolean>;
}

const MARKDOWN_KINDS = new Set<Skill["kind"]>([
  "agent_skill",
  "skills_sh_skill"
]);

/** The Actions tab only operates on markdown-backed skills. */
export function isMarkdownSkill(skill: Skill): boolean {
  return MARKDOWN_KINDS.has(skill.kind);
}

/**
 * Flat list of every markdown skill the Actions tab operates on. Iterates all
 * tools with no `detected` filter so it sees the exact same skill universe as
 * `buildActionsModel`/`actionsNavigableCount` — the cursor model and the save
 * path must never disagree on which skills exist.
 */
export function collectActionSkills(result: MultiProjectScanResult): Skill[] {
  const skills: Skill[] = [];
  for (const tool of result.userScope.tools) {
    skills.push(...tool.skills.filter(isMarkdownSkill));
  }
  return skills;
}

/**
 * Builds the pending-aware "is this skill disabled?" predicate. A staged
 * (unsaved) change overrides the on-disk `details.disabled` flag so headers and
 * row glyphs reflect what the user is about to save, not stale disk state.
 */
export function makeDesiredDisabled(
  pending: ReadonlyArray<{ id: string; action: "disable" | "enable" }>
): (skill: Skill) => boolean {
  const byId = new Map(pending.map((p) => [p.id, p.action]));
  return (skill) => {
    const staged = byId.get(skill.id);
    return staged ? staged === "disable" : skill.details?.disabled === true;
  };
}

/**
 * Produces the navigable item list. Iterates `result.userScope.tools`, which
 * always holds all tools in canonical `TOOL_DEFINITIONS` order (even
 * undetected ones), so every agent gets a header — empty groups included.
 * Skills keep their discovery (scan) order; no sorting.
 */
export function buildActionsModel(
  result: MultiProjectScanResult,
  collapsed: ReadonlySet<ToolId>,
  desiredDisabled: (skill: Skill) => boolean
): ActionsModel {
  const items: ActionsItem[] = [];
  const noneAfter = new Map<ToolId, boolean>();

  for (const tool of result.userScope.tools) {
    const markdown = tool.skills.filter(isMarkdownSkill);
    const disabled = markdown.filter(desiredDisabled).length;
    const enabled = markdown.length - disabled;
    const isCollapsed = collapsed.has(tool.id);

    items.push({
      type: "header",
      toolId: tool.id,
      name: tool.name,
      enabled,
      disabled,
      collapsed: isCollapsed,
      empty: markdown.length === 0
    });

    if (isCollapsed) {
      noneAfter.set(tool.id, false);
      continue;
    }
    for (const skill of markdown) {
      items.push({ type: "skill", skill, toolId: tool.id });
    }
    noneAfter.set(tool.id, markdown.length === 0);
  }

  return { items, noneAfter };
}

/**
 * Authoritative cursor max for the Actions tab: one slot per header plus the
 * markdown skills of every expanded group. Kept in lockstep with
 * `buildActionsModel(...).items.length`.
 */
export function actionsNavigableCount(
  result: MultiProjectScanResult,
  collapsed: ReadonlySet<ToolId>
): number {
  let count = 0;
  for (const tool of result.userScope.tools) {
    count += 1; // header is always navigable
    if (!collapsed.has(tool.id)) {
      count += tool.skills.filter(isMarkdownSkill).length;
    }
  }
  return count;
}
