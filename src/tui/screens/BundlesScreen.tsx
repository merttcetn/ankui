import React from "react";
import { Box, Text } from "ink";

import type { BundleRegistry } from "../../bundles/registry.js";
import type { DetectedBundle } from "../../bundles/detect.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import {
  clipHint,
  useAvailableContentRows,
  usePanelWidth
} from "../util/panel-width.js";
import { clampCursor, windowStart } from "../util/viewport.js";

/**
 * Per-bundle counts the screen needs to render the `● n ○ m` pair: how many
 * of the bundle's markdown skills are currently enabled vs disabled, taking
 * staged (pending) changes into account.
 */
export interface BundleRowCounts {
  enabled: number;
  disabled: number;
}

export interface BundlesScreenProps {
  registry: BundleRegistry;
  detected?: DetectedBundle[];
  /** Cursor index into the combined (tracked + detected) row list. */
  cursor: number;
  /**
   * Per-bundle live skill counts, keyed by `tracked:<name>` for registry
   * entries and `detected:<name>` for scanner-detected bundles. Omitted = no
   * counts shown (back-compat with screens that don't have a scan).
   */
  counts?: Map<string, BundleRowCounts>;
}

/**
 * Bundles tab. Lists both:
 *  - **Tracked** entries from `~/.ankui/bundles/registry.json` (added via `ankui add`)
 *  - **Detected** entries the scanner found on disk but ankui didn't install
 *
 * Cursor is a single index across the combined list (tracked first, then
 * detected). Each row shows the live enabled/disabled count when `counts` is
 * supplied so the user can see the effect of staged bundle-wide toggles.
 */
export function BundlesScreen({
  registry,
  detected = [],
  cursor,
  counts
}: BundlesScreenProps): React.ReactElement {
  const panelWidth = usePanelWidth();
  const tracked = registry.bundles;
  const totalRows = tracked.length + detected.length;
  const active = totalRows === 0 ? -1 : clampCursor(cursor, totalRows);

  // Fixed overhead: 2 SectionHeader (label + underline) + 1 summary Text
  // + 1 hint row, plus the group-label blocks ("Tracked"/"Detected" with
  // marginTop = 2 rows each).  Headers are only rendered when their slice
  // is non-empty, but to keep the budget stable as the window scrolls we
  // always reserve for both when they *exist on disk* — a cursor scrolling
  // off the tracked list shouldn't make an extra row pop into view and
  // re-overflow the terminal.
  const reserveTrackedHeader = tracked.length > 0 ? 2 : 0;
  const reserveDetectedHeader = detected.length > 0 ? 2 : 0;
  const fixedOverhead = 2 + 1 + 1 + reserveTrackedHeader + reserveDetectedHeader;
  const rowsBudget = useAvailableContentRows(fixedOverhead);
  const visibleCount = Math.max(1, rowsBudget);
  const start = totalRows === 0 ? 0 : windowStart(active, totalRows, visibleCount);
  const end = Math.min(totalRows, start + visibleCount);

  const visTrackedStart = Math.min(start, tracked.length);
  const visTrackedEnd = Math.min(end, tracked.length);
  const visDetectedStart = Math.max(0, start - tracked.length);
  const visDetectedEnd = Math.max(0, end - tracked.length);

  const visTracked = tracked.slice(visTrackedStart, visTrackedEnd);
  const visDetected = detected.slice(visDetectedStart, visDetectedEnd);
  const hidden = totalRows - (end - start);
  const bundlesHint = clipHint(hidden);

  return (
    <Box flexDirection="column">
      <SectionHeader label="BUNDLES" underlineWidth={panelWidth} />
      <Text>
        {tracked.length} tracked · {detected.length} detected
      </Text>

      {totalRows === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>No bundles installed.</Text>
          <Box marginTop={1}>
            <EmptyStateWhisper text="Run `ankui add <git-url>` to track a skill bundle." />
          </Box>
        </Box>
      ) : (
        <>
          {visTracked.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Tracked (ankui add)</Text>
              {visTracked.map((b, i) => {
                const navIndex = visTrackedStart + i;
                const distinctSkills = new Set(b.installs.map((inst) => inst.skillName)).size;
                const distinctTools = new Set(b.installs.map((inst) => inst.toolId)).size;
                const c = counts?.get(`tracked:${b.name}`);
                const liveCounts = c ? ` ● ${c.enabled}  ○ ${c.disabled}` : "";
                const meta =
                  `${distinctSkills}sk × ${distinctTools}tl  ${b.pinnedSha.slice(0, 7)}${liveCounts}`;
                const origin = b.scope === "project" ? "project" : "user";
                return (
                  <DotLeaderRow
                    key={`tracked-${b.name}`}
                    label={b.name}
                    metadata={meta}
                    width={panelWidth}
                    active={navIndex === active}
                    originLabel={origin}
                  />
                );
              })}
            </Box>
          )}

          {visDetected.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Detected (manually managed)</Text>
              {visDetected.map((d, i) => {
                const navIndex = tracked.length + visDetectedStart + i;
                const c = counts?.get(`detected:${d.name}`);
                const liveCounts = c ? ` ● ${c.enabled}  ○ ${c.disabled}` : "";
                const meta = `${d.totalSkills}sk × ${d.perTool.length}tl${liveCounts}`;
                return (
                  <DotLeaderRow
                    key={`detected-${d.name}`}
                    label={d.name}
                    metadata={meta}
                    width={panelWidth}
                    active={navIndex === active}
                    originLabel={d.kind}
                  />
                );
              })}
            </Box>
          )}

          {bundlesHint !== null && <Text dimColor>{bundlesHint}</Text>}
        </>
      )}
    </Box>
  );
}
