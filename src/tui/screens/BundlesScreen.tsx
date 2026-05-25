import React from "react";
import { Box, Text } from "ink";

import type { BundleRegistry } from "../../bundles/registry.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { usePanelWidth } from "../util/panel-width.js";

export interface BundlesScreenProps {
  registry: BundleRegistry;
  /** Cursor index into registry.bundles. Out-of-range values are clamped. */
  cursor: number;
}

/**
 * Read-only list of bundles tracked in `~/.ankui/bundles/registry.json`.
 * Phase 11a: list + cursor highlight only. Diff / remove leaf frames land in
 * Phase 11b. Reuses DotLeaderRow so each row matches the look of the existing
 * skill / MCP rows (label · · · metadata + dim italic origin suffix).
 */
export function BundlesScreen({ registry, cursor }: BundlesScreenProps): React.ReactElement {
  const panelWidth = usePanelWidth();
  const bundles = registry.bundles;
  const active = bundles.length === 0 ? 0 : Math.max(0, Math.min(cursor, bundles.length - 1));

  return (
    <Box flexDirection="column">
      <SectionHeader label="BUNDLES" underlineWidth={panelWidth} />
      <Text>
        {bundles.length} bundle{bundles.length === 1 ? "" : "s"} installed
      </Text>

      {bundles.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>No bundles installed.</Text>
          <Box marginTop={1}>
            <EmptyStateWhisper text="Run `ankui add <git-url>` to track a skill bundle." />
          </Box>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {bundles.map((b, i) => {
            const distinctSkills = new Set(b.installs.map((inst) => inst.skillName)).size;
            const distinctTools = new Set(b.installs.map((inst) => inst.toolId)).size;
            const meta = `${distinctSkills}sk × ${distinctTools}tl  pinned ${b.pinnedSha.slice(0, 7)}`;
            const origin = b.scope === "project" ? `project` : `user`;
            return (
              <DotLeaderRow
                key={b.name}
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
    </Box>
  );
}
