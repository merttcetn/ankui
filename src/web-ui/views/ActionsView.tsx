import React, { useMemo } from "react";

import type {
  AITool,
  MultiProjectScanResult,
  Skill
} from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { isMarkdownSkill } from "../../tui/util/actions-items.js";
import { groupSkillsByOrigin, type SkillGroup } from "../../utils/skill-groups.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { DotMatrixCoreSpiral } from "../components/DotMatrixCoreSpiral.js";
import { EntityRail } from "../components/EntityRail.js";
import {
  SkillGroupSection,
  type BulkAction
} from "../components/SkillGroupSection.js";
import { useBundleStatus } from "../hooks/useBundleStatus.js";
import { useExpandedGroups } from "../hooks/useExpandedGroups.js";

export interface ActionsViewProps {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onScan: (scan: MultiProjectScanResult) => void;
  pending: Array<{ id: string; action: "disable" | "enable" }>;
  saving: boolean;
  status: string | null;
  onStage: (id: string, action: "disable" | "enable", diskDisabled: boolean) => void;
  onBulkStage: (
    changes: Array<{ id: string; action: "disable" | "enable"; diskDisabled: boolean }>
  ) => void;
  onDiscard: () => void;
  onSave: () => void;
}

/**
 * A group is "Ankui-tracked" iff it's a bundle (origin kind) whose root path
 * lives under `~/.ankui/bundles/` — i.e. installed via `ankui add` and
 * therefore eligible for the check/update affordance. Bundles surfaced from
 * other sources stay as informational rows with no update buttons.
 */
function isAnkuiTrackedBundle(group: SkillGroup): boolean {
  return (
    group.origin.kind === "bundle" &&
    typeof group.origin.rootPath === "string" &&
    group.origin.rootPath.startsWith("~/.ankui/bundles/")
  );
}

/**
 * Pure-function view (no hooks). Composes the rail + a JSX `<ActionsToolPanel>`
 * for the selected tool. Bulk save/discard/pending all live in App; the panel
 * is a real React component so its internal hooks (useExpandedGroups,
 * useBundleStatus) register against a stable instance instead of being
 * re-counted across function calls to the view itself.
 */
export function ActionsView(props: ActionsViewProps): {
  rail: React.ReactNode;
  detail: React.ReactNode;
} {
  const tools = props.scan.userScope.tools.filter((t) =>
    t.skills.some(isMarkdownSkill)
  );

  if (tools.length === 0) {
    return {
      rail: undefined,
      detail: <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noActions}</div>
    };
  }

  const selectedId = props.selectedId ?? tools[0].id;
  const selectedTool = tools.find((t) => t.id === selectedId) ?? tools[0];

  const desiredDisabled = (skill: Skill): boolean => {
    const staged = props.pending.find((p) => p.id === skill.id);
    if (staged) return staged.action === "disable";
    return skill.details?.disabled === true;
  };

  const rail = (
    <EntityRail
      sections={[
        {
          heading: "tools",
          items: tools.map((t) => {
            const md = t.skills.filter(isMarkdownSkill);
            const off = md.filter(desiredDisabled).length;
            const on = md.length - off;
            const pendingCount = props.pending.filter((p) =>
              md.some((s) => s.id === p.id)
            ).length;
            return {
              id: t.id,
              label: `${t.name}  ${on}/${md.length}`,
              count: pendingCount > 0 ? pendingCount : undefined,
              pip: pendingCount > 0 ? "warn" : undefined
            };
          })
        }
      ]}
      selectedId={selectedId}
      onSelect={props.onSelectId}
      searchable
      searchPlaceholder="Filter tools…"
    />
  );

  const detail = (
    <ActionsToolPanel
      tool={selectedTool}
      pending={props.pending}
      saving={props.saving}
      status={props.status}
      desiredDisabled={desiredDisabled}
      onStage={props.onStage}
      onBulkStage={props.onBulkStage}
      onDiscard={props.onDiscard}
      onSave={props.onSave}
      onScan={props.onScan}
    />
  );

  return { rail, detail };
}

interface ActionsToolPanelProps {
  tool: AITool;
  pending: ActionsViewProps["pending"];
  saving: boolean;
  status: string | null;
  desiredDisabled: (skill: Skill) => boolean;
  onStage: ActionsViewProps["onStage"];
  onBulkStage: ActionsViewProps["onBulkStage"];
  onDiscard: () => void;
  onSave: () => void;
  onScan: (scan: MultiProjectScanResult) => void;
}

function ActionsToolPanel(props: ActionsToolPanelProps): React.ReactElement {
  const allSkills = useMemo(
    () => props.tool.skills.filter(isMarkdownSkill),
    [props.tool]
  );
  const groups = useMemo(() => groupSkillsByOrigin(allSkills), [allSkills]);
  const { isExpanded, toggle: toggleGroup } = useExpandedGroups("actions");
  const {
    statuses: bundleStatuses,
    check: checkBundleStatus,
    apply: applyBundleStatus
  } = useBundleStatus();

  const toggle = (skill: Skill): void => {
    const nextDisabled = !props.desiredDisabled(skill);
    const diskDisabled = skill.details?.disabled === true;
    props.onStage(skill.id, nextDisabled ? "disable" : "enable", diskDisabled);
  };

  const handleBulk = (group: SkillGroup, action: BulkAction): void => {
    const targets =
      action === "disable-all"
        ? group.skills.filter((s) => !props.desiredDisabled(s))
        : group.skills.filter((s) => props.desiredDisabled(s));
    props.onBulkStage(
      targets.map((s) => ({
        id: s.id,
        action: action === "disable-all" ? "disable" : "enable",
        diskDisabled: s.details?.disabled === true
      }))
    );
  };

  const bulkFor = (
    group: SkillGroup
  ): "disable-all" | "enable-all" | "both" | "none" => {
    if (group.alwaysExpanded) return "none";
    if (group.skills.length === 0) return "none";
    const enabled = group.skills.filter((s) => !props.desiredDisabled(s)).length;
    const disabled = group.skills.length - enabled;
    if (enabled === 0) return "enable-all";
    if (disabled === 0) return "disable-all";
    return "both";
  };

  const hasPending = props.pending.length > 0;
  const mdCount = allSkills.length;

  return (
    <>
      <DetailHeader
        crumb={`ACTIONS / ${props.tool.name.toUpperCase()}`}
        title={props.tool.name}
        meta={`${mdCount} MARKDOWN SKILL${mdCount === 1 ? "" : "S"}`}
      />

      <div className={`ank-view-body${hasPending ? " has-float-bar" : ""}`}>
        {groups.length === 0 ? (
          <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noActions}</div>
        ) : (
          groups.map((group) => (
            <SkillGroupSection
              key={group.label}
              group={group}
              expanded={isExpanded(group.label, group.alwaysExpanded)}
              onToggle={() => toggleGroup(group.label)}
              onBulkAction={(action) => handleBulk(group, action)}
              bulkAvailable={bulkFor(group)}
              onCheckUpdate={
                isAnkuiTrackedBundle(group)
                  ? () => checkBundleStatus(group.origin.name)
                  : undefined
              }
              onApplyUpdate={
                isAnkuiTrackedBundle(group)
                  ? (sha) =>
                      applyBundleStatus(group.origin.name, sha, {
                        onScan: props.onScan
                      })
                  : undefined
              }
              updateStatus={
                isAnkuiTrackedBundle(group)
                  ? bundleStatuses.get(group.origin.name)
                  : undefined
              }
            >
              {group.skills.map((skill) => {
                const isDisabled = props.desiredDisabled(skill);
                const staged = props.pending.some((p) => p.id === skill.id);
                return (
                  <div className={`skill-line${staged ? " is-pending" : ""}`} key={skill.id}>
                    <span className="name">{skill.name}</span>
                    {staged && <span className="ank-pill ank-pill-staged">STAGED</span>}
                    <MagneticToggle
                      enabled={!isDisabled}
                      label={skill.name}
                      onToggle={() => toggle(skill)}
                    />
                  </div>
                );
              })}
            </SkillGroupSection>
          ))
        )}
      </div>

      {hasPending && (
        <ActionsFloatBar
          pending={props.pending.length}
          saving={props.saving}
          status={props.status}
          onSave={props.onSave}
          onDiscard={props.onDiscard}
        />
      )}
      {props.status && !hasPending && (
        <div className="actions-status">{props.status}</div>
      )}
    </>
  );
}

function MagneticToggle({
  enabled,
  label,
  onToggle
}: {
  enabled: boolean;
  label: string;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`ank-toggle${enabled ? " is-on" : " is-off"}`}
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
    >
      <span className="ank-toggle-seg ank-toggle-seg-on">on</span>
      <span className="ank-toggle-seg ank-toggle-seg-off">off</span>
      <span className="ank-toggle-dot" aria-hidden />
    </button>
  );
}

function ActionsFloatBar(props: {
  pending: number;
  saving: boolean;
  status: string | null;
  onSave: () => void;
  onDiscard: () => void;
}): React.ReactElement {
  return (
    <div className="actions-float" role="status" aria-live="polite">
      <span className="actions-float-dot" aria-hidden />
      <span className="count">{props.pending} STAGED</span>
      <button
        className="action ghost"
        onClick={props.onDiscard}
        disabled={props.saving}
      >
        discard
      </button>
      <button
        className="action primary"
        onClick={props.onSave}
        disabled={props.saving}
      >
        {props.saving ? (
          <><DotMatrixCoreSpiral size={16} dotSize={1.8} decorative /> saving</>
        ) : "save"}
      </button>
      {props.status && <span className="dim">{props.status}</span>}
      {props.saving && <span className="actions-float-shimmer" aria-hidden />}
    </div>
  );
}
