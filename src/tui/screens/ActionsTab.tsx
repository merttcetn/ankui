import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill } from "../../types.js";
import { ACCENT } from "../theme/colors.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { clampCursor, windowStart } from "../util/viewport.js";

export interface ActionsTabProps {
  result: MultiProjectScanResult;
  cursor?: number;
  visibleCount?: number;
}

const DEFAULT_VISIBLE_COUNT = 12;

interface Row {
  skill: Skill;
  toolLabel: string;
}

/**
 * Read-only list of every markdown-backed skill in the user scope, with
 * an active/disabled state marker. Disable/enable keystrokes are wired in
 * the next task. The viewport bounds the height the same way SkillViewport
 * does, sharing the math helpers from util/viewport.ts.
 */
export function ActionsTab({
  result,
  cursor = 0,
  visibleCount = DEFAULT_VISIBLE_COUNT
}: ActionsTabProps): React.ReactElement {
  const rows = flattenRows(result);
  const total = rows.length;
  const safeCursor = clampCursor(cursor, total);
  const start = windowStart(safeCursor, total, Math.max(1, visibleCount));
  const visible = rows.slice(start, start + Math.max(1, visibleCount));

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["Ankui", "Actions"]} />
      <Box marginTop={1}>
        <SectionHeader label={`SKILLS (${total})`} />
      </Box>

      {visible.map((row, offset) => {
        const index = start + offset;
        const active = index === safeCursor;
        const stateGlyph = row.skill.details?.disabled ? "○" : "●";
        return (
          <Box key={row.skill.id}>
            <Text color={active ? ACCENT : undefined}>{active ? ACTIVE_PREFIX : " "}</Text>
            <Text color={active ? ACCENT : undefined}>{` ${stateGlyph} ${row.skill.name}`}</Text>
            <Text dimColor>{`   ${row.toolLabel}`}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          {`${safeCursor + 1}/${total} · ↑↓ select · [d] disable · [e] enable`}
        </Text>
      </Box>
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
