import React, { Fragment } from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { StatusPill } from "../components/StatusPill.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";
import { relativizeHome } from "../../utils/paths.js";
import { formatInlineOriginLabel } from "../../utils/skill-groups.js";
import {
  aggregateMcps,
  formatCapabilityTag,
  type McpGroup
} from "../util/mcp-grouping.js";
import {
  clipHint,
  useAvailableContentRows,
  usePanelWidth
} from "../util/panel-width.js";

export interface McpsTabProps {
  result: MultiProjectScanResult;
}

export function McpsTab({ result }: McpsTabProps): React.ReactElement {
  const groups = aggregateMcps(result);
  const panelWidth = usePanelWidth();

  if (groups.length === 0) {
    return (
      <Box flexDirection="column">
        <SectionHeader label="MCPS" underlineWidth={panelWidth} />
        <Text dimColor>No MCP servers configured.</Text>
        <Box marginTop={1}>
          <EmptyStateWhisper text={EMPTY_STATE_WHISPERS.noMcps} />
        </Box>
      </Box>
    );
  }

  const totalConfigs = groups.reduce((n, g) => n + g.configurations.length, 0);
  const toolSet = new Set<ToolId>();
  for (const group of groups) {
    for (const config of group.configurations) toolSet.add(config.toolId);
  }

  // Fixed overhead: 2 SectionHeader (label + underline) + 1 summary Text
  // + 1 reserved hint row. Per-group height varies, so we clip whole groups
  // (splitting a group mid-render is ugly) — accumulate until the next
  // group would overflow.
  const fixedOverhead = 2 + 1 + 1;
  const groupsBudget = useAvailableContentRows(fixedOverhead);
  let usedRows = 0;
  const visibleGroups: McpGroup[] = [];
  for (const group of groups) {
    if (usedRows + groupRows(group) > groupsBudget) break;
    usedRows += groupRows(group);
    visibleGroups.push(group);
  }
  const hiddenGroups = groups.length - visibleGroups.length;
  const groupsHint = clipHint(hiddenGroups);

  return (
    <Box flexDirection="column">
      <SectionHeader label="MCPS" underlineWidth={panelWidth} />
      <Text>
        {groups.length} unique · {totalConfigs} configurations · {toolSet.size} tools
      </Text>

      {visibleGroups.map((group) => (
        <McpGroupBlock
          key={group.name.toLowerCase()}
          group={group}
          homeDir={result.homeDir}
          rowWidth={panelWidth}
        />
      ))}
      {groupsHint !== null && <Text dimColor>{groupsHint}</Text>}
    </Box>
  );
}

function groupRows(group: McpGroup): number {
  return (
    1 + // marginTop
    1 + // name + capability pill
    group.configurations.length +
    (group.duplicatedAcrossTools ? 1 : 0) +
    (group.secretEnvKeys.length > 0 ? 1 : 0)
  );
}

interface McpGroupBlockProps {
  group: McpGroup;
  homeDir: string;
  rowWidth: number;
}

function McpGroupBlock({ group, homeDir, rowWidth }: McpGroupBlockProps): React.ReactElement {
  const tag = formatCapabilityTag(group);
  const uncatalogued = tag === "(uncatalogued)";
  return (
    <Box marginTop={1} flexDirection="column">
      <Box>
        <Text bold>{group.name}</Text>
        <Text>   </Text>
        {uncatalogued ? (
          <Text dimColor italic>(uncatalogued)</Text>
        ) : (
          <StatusPill
            label={group.capabilityCategories.join(", ")}
            accessLevel={group.accessLevel}
          />
        )}
      </Box>
      {group.configurations.map((config, idx) => (
        <Fragment key={`${idx}:${config.toolId}:${config.sourcePath}`}>
          <DotLeaderRow
            label={`   ${config.toolId}`}
            metadata={relativizeHome(config.sourcePath, homeDir)}
            width={rowWidth}
            originLabel={formatInlineOriginLabel(config.bundleOrigin)}
          />
        </Fragment>
      ))}
      {group.duplicatedAcrossTools && (
        <Text color="red">
          {"   "}⚠ Configured in {new Set(group.configurations.map((c) => c.toolId)).size} tools
        </Text>
      )}
      {group.secretEnvKeys.length > 0 && (
        <Text color="red">
          {"   "}⚠ Secret-bearing env keys: {group.secretEnvKeys.join(", ")}
        </Text>
      )}
    </Box>
  );
}
