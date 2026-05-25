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
        return (
          <DotLeaderRow
            key={row.skill.id}
            label={row.skill.name}
            metadata={formatKind(row.kind)}
            width={panelWidth}
            active={index === safeCursor}
            originLabel={formatInlineOriginLabel(origin)}
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
