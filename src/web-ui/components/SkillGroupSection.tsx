import React, { useEffect, useState } from "react";

import type { SkillGroup } from "../../utils/skill-groups.js";
import type { UpdateStatus } from "../hooks/useBundleStatus.js";

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
  /**
   * If provided, renders a `Check` button in the header that calls this to
   * ask the server whether the bundle's upstream has new commits.
   */
  onCheckUpdate?: () => Promise<void> | void;
  /**
   * If provided, called with the pinned SHA when the user confirms the
   * `Apply` button in the inline diff panel.
   */
  onApplyUpdate?: (expectedSha: string) => Promise<void> | void;
  /** Current update status for this bundle; drives the header affordance. */
  updateStatus?: UpdateStatus;
  /** Body content rendered when expanded. */
  children?: React.ReactNode;
}

/**
 * Renders a single `SkillGroup` section: collapse header with label + count,
 * optional bulk-action buttons, optional bundle-update affordance, and
 * (when expanded) a render-prop body.
 *
 * The header toggle is `disabled` for the always-expanded "yours" group so
 * it can't be collapsed, and bulk buttons never render for that group either.
 *
 * The bundle-update affordance only renders when at least one of
 * `onCheckUpdate` / `onApplyUpdate` / `updateStatus` is provided — keeps
 * existing call sites (e.g. ToolsView, McpsView) byte-identical.
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
    onCheckUpdate,
    onApplyUpdate,
    updateStatus,
    children
  } = props;

  const showBulk =
    onBulkAction !== undefined &&
    bulkAvailable !== "none" &&
    !group.alwaysExpanded;

  const showUpdate =
    onCheckUpdate !== undefined ||
    onApplyUpdate !== undefined ||
    updateStatus !== undefined;

  const [diffOpen, setDiffOpen] = useState(false);

  // Auto-collapse the diff panel whenever the bundle leaves the "ahead" state
  // (e.g. after Apply succeeds, or the user re-checks and it's now up to date).
  const ahead = updateStatus?.state === "ahead";
  useEffect(() => {
    if (!ahead && diffOpen) setDiffOpen(false);
  }, [ahead, diffOpen]);

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
        {showUpdate && (
          <UpdateAffordance
            status={updateStatus}
            onCheck={onCheckUpdate}
            onToggleDiff={() => setDiffOpen((v) => !v)}
          />
        )}
        {showBulk && (
          <BulkActionButtons
            available={bulkAvailable}
            onAction={onBulkAction}
          />
        )}
      </div>
      {showUpdate && ahead && diffOpen && updateStatus?.state === "ahead" && (
        <UpdateDiffPanel
          status={updateStatus}
          onApply={onApplyUpdate}
          onCancel={() => setDiffOpen(false)}
        />
      )}
      {expanded && <div className="skill-group-body">{children}</div>}
    </div>
  );
}

function UpdateAffordance(props: {
  status: UpdateStatus | undefined;
  onCheck?: () => Promise<void> | void;
  onToggleDiff: () => void;
}): React.ReactElement {
  const { status, onCheck, onToggleDiff } = props;
  if (status === undefined || status.state === "unknown") {
    return (
      <span className="skill-group-update">
        <button
          className="action"
          onClick={() => onCheck && void onCheck()}
          disabled={onCheck === undefined}
        >
          Check
        </button>
      </span>
    );
  }
  if (status.state === "checking") {
    return (
      <span className="skill-group-update dim">checking…</span>
    );
  }
  if (status.state === "up_to_date") {
    return <span className="skill-group-update dim">Up to date</span>;
  }
  if (status.state === "ahead") {
    return (
      <span className="skill-group-update">
        <span className="dim">{`${status.count} ahead`}</span>
        <button className="action" onClick={onToggleDiff}>
          Update
        </button>
      </span>
    );
  }
  if (status.state === "applying") {
    return <span className="skill-group-update dim">applying…</span>;
  }
  return <span className="skill-group-update dim">{status.message}</span>;
}

function UpdateDiffPanel(props: {
  status: Extract<UpdateStatus, { state: "ahead" }>;
  onApply?: (expectedSha: string) => Promise<void> | void;
  onCancel: () => void;
}): React.ReactElement {
  const { status, onApply, onCancel } = props;
  const added = status.changes.added.map(skillNameFromPath);
  const removed = status.changes.removed.map(skillNameFromPath);
  const modified = status.changes.modified.map(skillNameFromPath);
  return (
    <div className="skill-group-diff">
      {added.length > 0 && (
        <div>
          <span className="ok">Added: </span>
          <span>{added.join(", ")}</span>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <span className="warn">Removed: </span>
          <span>{removed.join(", ")}</span>
        </div>
      )}
      {modified.length > 0 && (
        <div>
          <span className="dim">Modified: </span>
          <span>{modified.join(", ")}</span>
        </div>
      )}
      <div className="skill-group-diff-actions">
        <button
          className="action primary"
          onClick={() => onApply && void onApply(status.pinnedSha)}
          disabled={onApply === undefined}
        >
          Apply
        </button>
        <button className="action" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Bundle changes arrive as `${parent}/SKILL.md` paths; the parent dir is the
 * skill name. Falls back to the raw path if the shape is unexpected.
 */
function skillNameFromPath(p: string): string {
  const trimmed = p.endsWith("/SKILL.md") ? p.slice(0, -"/SKILL.md".length) : p;
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
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
