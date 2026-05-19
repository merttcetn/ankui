import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill, ToolId } from "../../types.js";
import {
  computeSessionSummary,
  type SessionAction
} from "../../utils/session-summary.js";
import { ACCENT } from "../theme/colors.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { clampCursor, windowStart } from "../util/viewport.js";

export interface ActionsTabProps {
  result: MultiProjectScanResult;
  cursor?: number;
  visibleCount?: number;
  sessionActions?: ReadonlyArray<SessionAction>;
  actionFeedback?: SkillActionFeedback | null;
  pending?: ReadonlyArray<PendingChange>;
  saving?: boolean;
  saveSummary?: string | null;
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

interface Row {
  skill: Skill;
  toolLabel: string;
}

/**
 * Lists every markdown-backed user-scope skill with an active/disabled marker.
 * The right column mirrors current state counts plus the net changes made in
 * this TUI session.
 */
export function ActionsTab({
  result,
  cursor = 0,
  visibleCount = DEFAULT_VISIBLE_COUNT,
  sessionActions = [],
  actionFeedback = null,
  pending = [],
  saving = false,
  saveSummary = null
}: ActionsTabProps): React.ReactElement {
  const rows = flattenRows(result);
  const total = rows.length;
  const safeCursor = clampCursor(cursor, total);
  const start = windowStart(safeCursor, total, Math.max(1, visibleCount));
  const visible = rows.slice(start, start + Math.max(1, visibleCount));
  // The left list is a checkbox the user is editing: the glyph reflects the
  // desired state (on-disk overlaid with any unsaved pending change), not the
  // raw on-disk state. Nothing here touches disk — that's [s].
  const pendingById = new Map(pending.map((p) => [p.id, p.action]));
  const desiredDisabled = (skill: Skill): boolean => {
    const p = pendingById.get(skill.id);
    return p ? p === "disable" : skill.details?.disabled === true;
  };
  const enabledCount = rows.filter((row) => !desiredDisabled(row.skill)).length;
  const disabledCount = total - enabledCount;

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["Ankui", "Actions"]} />
      <ActionStatus feedback={actionFeedback} saving={saving} saveSummary={saveSummary} />
      <Box marginTop={1} flexDirection="row">
        <Box flexDirection="column" width="58%">
          <SectionHeader label={`SKILLS (${total})`} underlineWidth={44} />

          {visible.map((row, offset) => {
            const index = start + offset;
            const active = index === safeCursor;
            const stateGlyph = desiredDisabled(row.skill) ? "○" : "●";
            const suffix = actionSuffix(actionFeedback, row.skill);
            return (
              <Box key={row.skill.id}>
                <Text color={active ? ACCENT : undefined}>{active ? ACTIVE_PREFIX : " "}</Text>
                <Text color={active ? ACCENT : undefined}>{` ${stateGlyph} ${row.skill.name}`}</Text>
                {suffix && <Text color={ACCENT}>{`   ${suffix}`}</Text>}
                <Text dimColor>{`   ${row.toolLabel}`}</Text>
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text dimColor>
              {`${safeCursor + 1}/${total} · ↑↓ select · [d] disable · [e] enable · [s] save`}
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

function flattenRows(result: MultiProjectScanResult): Row[] {
  const rows: Row[] = [];
  for (const tool of result.userScope.tools) {
    if (!tool.detected) continue;
    const markdownSkills = tool.skills.filter(
      (s) => s.kind === "agent_skill" || s.kind === "skills_sh_skill"
    );
    markdownSkills.forEach((skill) => {
      rows.push({ skill, toolLabel: tool.id });
    });
  }
  return rows;
}
