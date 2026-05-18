import React from "react";
import { Box, Text } from "ink";

import type { Skill, SkillKind } from "../../types.js";
import { ACCENT } from "../theme/colors.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";
import { groupSkillsByKind } from "../util/skill-grouping.js";
import { clampCursor, windowStart } from "../util/viewport.js";

export interface SkillViewportProps {
  skills: ReadonlyArray<Skill>;
  cursor: number;
  visibleCount?: number;
}

const DEFAULT_VISIBLE_COUNT = 12;
const NAME_WIDTH = 44;

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

  return (
    <Box flexDirection="column">
      {visible.map((row, offset) => {
        const index = start + offset;
        return (
          <Box key={row.skill.id}>
            <Text color={index === safeCursor ? ACCENT : undefined}>
              {index === safeCursor ? ACTIVE_PREFIX : " "}
            </Text>
            <Text>{` ${fit(row.skill.name, NAME_WIDTH)} `}</Text>
            <Text dimColor>{formatKind(row.kind)}</Text>
          </Box>
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

function fit(value: string, width: number): string {
  if (value.length > width) return `${value.slice(0, width - 3)}...`;
  return value.padEnd(width, " ");
}

function formatKind(kind: SkillKind): string {
  return kind.replaceAll("_", " ");
}
