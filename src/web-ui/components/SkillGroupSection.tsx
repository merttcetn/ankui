import React from "react";

import type { SkillGroup } from "../../utils/skill-groups.js";

export type BulkAction = "enable-all" | "disable-all";

export interface SkillGroupSectionProps {
  group: SkillGroup;
  expanded: boolean;
  onToggle: () => void;
  /**
   * When provided, renders bulk-action button(s) in the header. Undefined =
   * informational surface (e.g. ToolsView) — no bulk buttons rendered.
   */
  onBulkAction?: (action: BulkAction) => void;
  /** Which bulk actions to expose. */
  bulkAvailable?: "disable-all" | "enable-all" | "both" | "none";
  /** Body content rendered when expanded. */
  children?: React.ReactNode;
}

/**
 * Renders a single `SkillGroup` section: collapse header with label + count,
 * optional bulk-action buttons, and (when expanded) a render-prop body.
 *
 * The header toggle is `disabled` for the always-expanded "yours" group so
 * it can't be collapsed, and bulk buttons never render for that group either.
 */
export function SkillGroupSection(
  props: SkillGroupSectionProps
): React.ReactElement {
  const {
    group,
    expanded,
    onToggle,
    onBulkAction,
    bulkAvailable = "none",
    children
  } = props;

  const showBulk =
    onBulkAction !== undefined &&
    bulkAvailable !== "none" &&
    !group.alwaysExpanded;

  return (
    <div className="skill-group">
      <div className="skill-group-header">
        <button
          className="skill-group-toggle"
          onClick={onToggle}
          disabled={group.alwaysExpanded}
          aria-expanded={expanded}
        >
          <span className={expanded ? "caret open" : "caret"}>▸</span>{" "}
          {group.label}
          <span className="dim">{` (${group.skills.length})`}</span>
        </button>
        {showBulk && (
          <BulkActionButtons
            available={bulkAvailable as "disable-all" | "enable-all" | "both"}
            onAction={onBulkAction}
          />
        )}
      </div>
      {expanded && <div className="skill-group-body">{children}</div>}
    </div>
  );
}

function BulkActionButtons(props: {
  available: "disable-all" | "enable-all" | "both";
  onAction: (action: BulkAction) => void;
}): React.ReactElement {
  if (props.available === "both") {
    return (
      <span className="skill-group-bulk">
        <button
          className="action"
          onClick={() => props.onAction("enable-all")}
        >
          Enable all
        </button>
        <button
          className="action"
          onClick={() => props.onAction("disable-all")}
        >
          Disable all
        </button>
      </span>
    );
  }
  const action: BulkAction = props.available;
  const label = action === "disable-all" ? "Disable all" : "Enable all";
  return (
    <span className="skill-group-bulk">
      <button className="action" onClick={() => props.onAction(action)}>
        {label}
      </button>
    </span>
  );
}
