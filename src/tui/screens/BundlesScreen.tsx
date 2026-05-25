import React from "react";
import { Box, Text } from "ink";

import type { BundleRegistry } from "../../bundles/registry.js";
import type { DetectedBundle } from "../../bundles/detect.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { usePanelWidth } from "../util/panel-width.js";

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
  const active = totalRows === 0 ? -1 : Math.max(0, Math.min(cursor, totalRows - 1));

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
          {tracked.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Tracked (ankui add)</Text>
              {tracked.map((b, i) => {
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
                    active={i === active}
                    originLabel={origin}
                  />
                );
              })}
            </Box>
          )}

          {detected.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Detected (manually managed)</Text>
              {detected.map((d, i) => {
                const navIndex = tracked.length + i;
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
        </>
      )}
    </Box>
  );
}
