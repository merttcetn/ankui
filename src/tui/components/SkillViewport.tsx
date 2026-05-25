import React from "react";
import { Box, Text } from "ink";

import type { BundleOrigin } from "../../scanner/bundle-origin.js";
import type { Skill, SkillKind } from "../../types.js";
import { formatInlineOriginLabel } from "../../utils/skill-groups.js";
import { groupSkillsByKind } from "../util/skill-grouping.js";
import { usePanelWidth } from "../util/panel-width.js";
import { clampCursor, windowStart } from "../util/viewport.js";
import { DotLeaderRow } from "./DotLeaderRow.js";

export interface SkillViewportProps {
  skills: ReadonlyArray<Skill>;
  cursor: number;
  visibleCount?: number;
}

const DEFAULT_VISIBLE_COUNT = 12;
// Reserve space for the active "▶ " prefix even on inactive rows so the
// label truncation budget stays stable as the cursor moves.
const PREFIX_RESERVED = 2;
// Minimum dot-leader gap we want to keep visible between label and metadata.
const MIN_LEADER_GAP = 4;
// Floor for the label budget — below this we'd rather let it overflow than
// shrink to a useless 1-2 character stub.
const MIN_LABEL_WIDTH = 8;

interface SkillRow {
  skill: Skill;
  kind: SkillKind;
}

export function SkillViewport({
  skills,
  cursor,
  visibleCount = DEFAULT_VISIBLE_COUNT
}: SkillViewportProps): React.ReactElement {
  const rows = flattenSkills(skills);
  const safeCursor = clampCursor(cursor, rows.length);
  const count = Math.max(1, visibleCount);
  const start = windowStart(safeCursor, rows.length, count);
  const visible = rows.slice(start, start + count);
  const end = start + visible.length;
  const panelWidth = usePanelWidth();

  return (
    <Box flexDirection="column">
      {visible.map((row, offset) => {
        const index = start + offset;
        const origin = row.skill.details?.bundleOrigin as
          | BundleOrigin
          | undefined;
        const originLabel = formatInlineOriginLabel(origin);
        const metadata = formatKind(row.kind);
        const labelBudget = computeLabelBudget(panelWidth, metadata, originLabel);
        const label = fit(row.skill.name, labelBudget);
        return (
          <DotLeaderRow
            key={row.skill.id}
            label={label}
            metadata={metadata}
            width={panelWidth}
            active={index === safeCursor}
            originLabel={originLabel}
          />
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>
          {`${safeCursor + 1}/${rows.length} · showing ${start + 1}-${end} · ↑/↓ scroll`}
        </Text>
      </Box>
    </Box>
  );
}

function flattenSkills(skills: ReadonlyArray<Skill>): SkillRow[] {
  return [...groupSkillsByKind(skills).entries()].flatMap(([kind, list]) =>
    list.map((skill) => ({ skill, kind }))
  );
}

function formatKind(kind: SkillKind): string {
  return kind.replaceAll("_", " ");
}

function computeLabelBudget(
  panelWidth: number,
  metadata: string,
  originLabel: string | undefined
): number {
  const originCost = originLabel ? originLabel.length + 1 : 0;
  const budget =
    panelWidth - PREFIX_RESERVED - metadata.length - originCost - MIN_LEADER_GAP;
  return Math.max(MIN_LABEL_WIDTH, budget);
}

function fit(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}
