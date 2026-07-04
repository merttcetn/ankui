import React from "react";
import { Box, Text } from "ink";

import type { Finding } from "../../types.js";
import { severityLabel } from "../../utils/finding-order.js";
import { relativizeHome } from "../../utils/paths.js";
import { ACCENT } from "../theme/colors.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";
import type { FindingSection } from "../util/finding-grouping.js";
import { clampCursor, windowStart } from "../util/viewport.js";
import { usePanelWidth } from "../util/panel-width.js";
import { SectionHeader } from "./SectionHeader.js";

export interface AccessViewportProps {
  sections: ReadonlyArray<FindingSection>;
  homeDir: string;
  cursor: number;
  /** How many finding cards render at once. Default 1 — single-card
   *  pagination. Each ↑/↓ steps to the next finding so the frame stays
   *  bounded on short terminals. Tests opt into multi-card windows
   *  by passing an explicit value. */
  visibleCount?: number;
}

const DEFAULT_VISIBLE_COUNT = 1;

interface FindingRow {
  finding: Finding;
  sectionLabel: string;
  isSectionFirst: boolean;
}

/**
 * Card-paginated viewport for access findings. Each ↑/↓ moves the cursor
 * by one finding (not one text row), so the section structure stays
 * legible while the frame stays bounded.
 *
 * The active card carries the ▶ accent prefix (matches SkillViewport).
 * Section headers are only drawn for the first visible finding of a
 * section, mirroring how the formatter groups output.
 */
export function AccessViewport({
  sections,
  homeDir,
  cursor,
  visibleCount = DEFAULT_VISIBLE_COUNT
}: AccessViewportProps): React.ReactElement {
  const rows = flattenSections(sections);
  const total = rows.length;
  const safeCursor = clampCursor(cursor, total);
  const count = Math.max(1, visibleCount);
  const start = windowStart(safeCursor, total, count);
  const visible = rows.slice(start, start + count);
  const panelWidth = usePanelWidth();

  return (
    <Box flexDirection="column">
      {visible.map((row, offset) => {
        const index = start + offset;
        const isActive = index === safeCursor;
        const isFirstVisibleOfSection =
          offset === 0 || visible[offset - 1].sectionLabel !== row.sectionLabel;

        return (
          <Box key={row.finding.id} flexDirection="column">
            {isFirstVisibleOfSection && (
              <Box marginTop={1}>
                <SectionHeader
                  label={row.sectionLabel.toUpperCase()}
                  underlineWidth={panelWidth}
                />
              </Box>
            )}
            <FindingCard
              finding={row.finding}
              homeDir={homeDir}
              active={isActive}
            />
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          {`${safeCursor + 1}/${total} findings · ↑/↓ next/prev`}
        </Text>
      </Box>
    </Box>
  );
}

interface FindingCardProps {
  finding: Finding;
  homeDir: string;
  active: boolean;
}

function FindingCard({ finding, homeDir, active }: FindingCardProps): React.ReactElement {
  const prefix = active ? ACTIVE_PREFIX : " ";
  const sources = finding.sourcePaths
    .map((p) => relativizeHome(p, homeDir))
    .join(", ");
  const sourceLabel = finding.sourcePaths.length === 1 ? "Source" : "Sources";

  return (
    <Box marginTop={1} flexDirection="column">
      <Box>
        <Text color={active ? ACCENT : undefined}>{`${prefix} `}</Text>
        <Text color={colorForSeverity(finding.severity)}>
          {`[${severityLabel(finding.severity)}]`}
        </Text>
        <Text color={active ? ACCENT : undefined}>{` • ${finding.title}`}</Text>
      </Box>
      <Text dimColor>{`    Scope: ${finding.scope} · Tools: ${finding.toolIds.join(", ")}`}</Text>
      <Text dimColor>{`    ${sourceLabel}: ${sources}`}</Text>
      <Text>{`    Recommendation: ${finding.recommendation}`}</Text>
    </Box>
  );
}

function colorForSeverity(severity: Finding["severity"]): string | undefined {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "yellow";
    case "low":
      return "cyan";
  }
}

function flattenSections(
  sections: ReadonlyArray<FindingSection>
): FindingRow[] {
  const rows: FindingRow[] = [];
  for (const section of sections) {
    section.findings.forEach((finding, idx) => {
      rows.push({
        finding,
        sectionLabel: section.label,
        isSectionFirst: idx === 0
      });
    });
  }
  return rows;
}
