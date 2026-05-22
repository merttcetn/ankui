import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill, ToolId } from "../../types.js";
import {
  computeSessionSummary,
  type SessionAction
} from "../../utils/session-summary.js";
import { ACCENT } from "../theme/colors.js";
import {
  ACTIVE_PREFIX,
  GROUP_COLLAPSED,
  GROUP_EXPANDED
} from "../theme/icons.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { clampCursor, windowStart } from "../util/viewport.js";
import {
  buildActionsModel,
  makeDesiredDisabled,
  type ActionsItem
} from "../util/actions-items.js";

export interface ActionsTabProps {
  result: MultiProjectScanResult;
  cursor?: number;
  visibleCount?: number;
  sessionActions?: ReadonlyArray<SessionAction>;
  actionFeedback?: SkillActionFeedback | null;
  pending?: ReadonlyArray<PendingChange>;
  saving?: boolean;
  saveSummary?: string | null;
  /** Actions tab: agent groups currently collapsed (owned by tui-state). */
  collapsed?: ReadonlyArray<ToolId>;
}

const DEFAULT_VISIBLE_COUNT = 12;

export interface SkillActionFeedback {
  status: "success" | "noop" | "error";
  action: "disable" | "enable";
  toolId: ToolId;
  kind?: Skill["kind"];
  name: string;
  message?: string;
}

/**
 * A disable/enable the user has chosen but not yet saved to disk. `action`
 * is the operation needed to take the on-disk state to the desired state.
 */
export interface PendingChange {
  id: string;
  toolId: ToolId;
  kind: Skill["kind"];
  name: string;
  action: "disable" | "enable";
}

type RenderRow =
  | {
      kind: "header";
      item: Extract<ActionsItem, { type: "header" }>;
      navIndex: number;
    }
  | {
      kind: "skill";
      item: Extract<ActionsItem, { type: "skill" }>;
      navIndex: number;
    }
  | { kind: "none"; toolId: ToolId };

/**
 * Lists markdown-backed user-scope skills grouped under a header per agent.
 * Each group header (`CLAUDE   ● n  ○ m   [▾]`) is always present and is the
 * only place the cursor can toggle collapse; collapsed groups hide their
 * skills. The right column mirrors global state counts plus this session's
 * saved changes.
 */
export function ActionsTab({
  result,
  cursor = 0,
  visibleCount = DEFAULT_VISIBLE_COUNT,
  sessionActions = [],
  actionFeedback = null,
  pending = [],
  saving = false,
  saveSummary = null,
  collapsed = []
}: ActionsTabProps): React.ReactElement {
  // The left list is a checkbox the user is editing: glyphs and header counts
  // reflect the desired state (on-disk overlaid with unsaved pending changes),
  // not raw on-disk state. Nothing here touches disk — that's [s].
  const desiredDisabled = makeDesiredDisabled(pending);
  const collapsedSet = new Set<ToolId>(collapsed);
  const model = buildActionsModel(result, collapsedSet, desiredDisabled);
  const navItems = model.items;
  const total = navItems.length;
  const safeCursor = clampCursor(cursor, total);
  const span = Math.max(1, visibleCount);

  // Flatten the navigable stream into physical render rows. A `(none)`
  // placeholder is render-only and never navigable, but it still occupies a
  // physical row — so the viewport windows over `renderRows`, not `navItems`,
  // or empty groups would push the list past `visibleCount`.
  const renderRows: RenderRow[] = [];
  navItems.forEach((item, navIndex) => {
    if (item.type === "header") {
      renderRows.push({ kind: "header", item, navIndex });
      if (model.noneAfter.get(item.toolId)) {
        renderRows.push({ kind: "none", toolId: item.toolId });
      }
    } else {
      renderRows.push({ kind: "skill", item, navIndex });
    }
  });

  const cursorPhysical = renderRows.findIndex(
    (row) => row.kind !== "none" && row.navIndex === safeCursor
  );
  const start = windowStart(cursorPhysical, renderRows.length, span);
  const visible = renderRows.slice(start, start + span);

  const enabledCount = navItems.reduce(
    (n, it) => (it.type === "header" ? n + it.enabled : n),
    0
  );
  const disabledCount = navItems.reduce(
    (n, it) => (it.type === "header" ? n + it.disabled : n),
    0
  );
  // The SKILLS header counts actual skills; `total` (headers + visible skills)
  // is the cursor's navigable span, surfaced in the footer instead.
  const skillCount = enabledCount + disabledCount;

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["Ankui", "Actions"]} />
      <ActionStatus feedback={actionFeedback} saving={saving} saveSummary={saveSummary} />
      <Box marginTop={1} flexDirection="row">
        <Box flexDirection="column" width="58%">
          <SectionHeader label={`SKILLS (${skillCount})`} underlineWidth={44} />

          {visible.map((row) => {
            if (row.kind === "none") {
              return (
                <Box key={`none:${row.toolId}`}>
                  <Text dimColor>{"   (none)"}</Text>
                </Box>
              );
            }
            if (row.kind === "header") {
              const active = row.navIndex === safeCursor;
              const glyph = row.item.collapsed
                ? GROUP_COLLAPSED
                : GROUP_EXPANDED;
              return (
                <Box key={`hdr:${row.item.toolId}`} marginTop={1}>
                  <Text color={active ? ACCENT : undefined}>
                    {active ? ACTIVE_PREFIX : " "}
                  </Text>
                  <Text bold color={active ? ACCENT : undefined}>
                    {` ${row.item.name.toUpperCase()}`}
                  </Text>
                  <Text dimColor>
                    {`   ● ${row.item.enabled}  ○ ${row.item.disabled}   [${glyph}]`}
                  </Text>
                </Box>
              );
            }
            const skill = row.item.skill;
            const active = row.navIndex === safeCursor;
            const stateGlyph = desiredDisabled(skill) ? "○" : "●";
            const suffix = actionSuffix(actionFeedback, skill);
            return (
              <Box key={skill.id}>
                <Text color={active ? ACCENT : undefined}>{active ? ACTIVE_PREFIX : " "}</Text>
                <Text color={active ? ACCENT : undefined}>{` ${stateGlyph} ${skill.name}`}</Text>
                {suffix && <Text color={ACCENT}>{`   ${suffix}`}</Text>}
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text dimColor>
              {`${safeCursor + 1}/${total} · ↑↓ select · [space] collapse · [d] disable · [e] enable · [s] save`}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginLeft={2} width="38%">
          <SectionHeader label="STATE" underlineWidth={30} />
          <Text>{`● Enabled ${enabledCount}`}</Text>
          <Text>{`○ Disabled ${disabledCount}`}</Text>
          <PendingChanges pending={pending} />
          <SessionChanges actions={sessionActions} />
        </Box>
      </Box>
    </Box>
  );
}

function PendingChanges({
  pending
}: {
  pending: ReadonlyArray<PendingChange>;
}): React.ReactElement | null {
  if (pending.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{`Pending (unsaved) (${pending.length})`}</Text>
      {pending.map((p, i) => (
        <Text key={`${p.id}:${i}`} color={ACCENT}>
          {`→ ${p.action === "enable" ? "enable " : "disable"} ${p.toolId}/${p.name}`}
        </Text>
      ))}
      <Text dimColor>[s] save</Text>
    </Box>
  );
}

function ActionStatus({
  feedback,
  saving = false,
  saveSummary = null
}: {
  feedback: SkillActionFeedback | null;
  saving?: boolean;
  saveSummary?: string | null;
}): React.ReactElement {
  if (saving) {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT}>◆ Saving…</Text>
      </Box>
    );
  }
  if (saveSummary) {
    return (
      <Box marginTop={1}>
        <Text color={/failed/.test(saveSummary) ? "red" : ACCENT}>{`◆ ${saveSummary}`}</Text>
      </Box>
    );
  }
  if (!feedback) {
    return (
      <Box marginTop={1}>
        <Text dimColor>Ready. Select a skill, then press [d] or [e].</Text>
      </Box>
    );
  }

  const message =
    feedback.message ??
    `${feedback.action === "enable" ? "Enabled" : "Disabled"} ${feedback.toolId}/${feedback.name}`;
  const color = feedback.status === "error" ? "red" : feedback.status === "success" ? ACCENT : "gray";
  const prefix =
    feedback.status === "success" ? "◆" : feedback.status === "error" ? "!" : "·";

  return (
    <Box marginTop={1}>
      <Text color={color}>{`${prefix} ${message}`}</Text>
    </Box>
  );
}

function actionSuffix(
  feedback: SkillActionFeedback | null,
  skill: Skill
): string | null {
  if (!feedback || feedback.status !== "success") return null;
  if (feedback.toolId !== skill.toolId || feedback.name !== skill.name) return null;
  if (feedback.kind && feedback.kind !== skill.kind) return null;
  return feedback.action === "enable" ? "just enabled" : "just disabled";
}

function SessionChanges({
  actions
}: {
  actions: ReadonlyArray<SessionAction>;
}): React.ReactElement {
  const summary = computeSessionSummary(actions);
  const hasChanges =
    summary.netDisabled.length > 0 || summary.netEnabled.length > 0;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Saved this session</Text>
      {!hasChanges && <Text dimColor>No changes yet</Text>}
      {summary.netEnabled.length > 0 && (
        <Box flexDirection="column">
          <Text>{`Enabled this session (${summary.netEnabled.length})`}</Text>
          {summary.netEnabled.map((skill, i) => (
            <Text key={`${skill.toolId}:${skill.name}:enabled:${i}`} dimColor>
              {`● ${skill.toolId}/${skill.name}`}
            </Text>
          ))}
        </Box>
      )}
      {summary.netDisabled.length > 0 && (
        <Box flexDirection="column">
          <Text>{`Disabled this session (${summary.netDisabled.length})`}</Text>
          {summary.netDisabled.map((skill, i) => (
            <Text key={`${skill.toolId}:${skill.name}:disabled:${i}`} dimColor>
              {`○ ${skill.toolId}/${skill.name}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

