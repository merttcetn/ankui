import React, { Fragment } from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { StatusPill } from "../components/StatusPill.js";
import { relativizeHome } from "../../utils/paths.js";
import {
  aggregateMcps,
  formatCapabilityTag,
  type McpGroup
} from "../util/mcp-grouping.js";

const ROW_WIDTH = 60;

export interface McpsTabProps {
  result: MultiProjectScanResult;
}

export function McpsTab({ result }: McpsTabProps): React.ReactElement {
  const groups = aggregateMcps(result);

  if (groups.length === 0) {
    return (
      <Box flexDirection="column">
        <SectionHeader label="MCPS" />
        <Text dimColor>No MCP servers configured.</Text>
      </Box>
    );
  }

  const totalConfigs = groups.reduce((n, g) => n + g.configurations.length, 0);
  const toolSet = new Set<ToolId>();
  for (const group of groups) {
    for (const config of group.configurations) toolSet.add(config.toolId);
  }

  return (
    <Box flexDirection="column">
      <SectionHeader label="MCPS" />
      <Text>
        {groups.length} unique · {totalConfigs} configurations · {toolSet.size} tools
      </Text>

      {groups.map((group) => (
        <McpGroupBlock key={group.name.toLowerCase()} group={group} homeDir={result.homeDir} />
      ))}
    </Box>
  );
}

interface McpGroupBlockProps {
  group: McpGroup;
  homeDir: string;
}

function McpGroupBlock({ group, homeDir }: McpGroupBlockProps): React.ReactElement {
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
      {group.configurations.map((config) => (
        <Fragment key={`${config.toolId}:${config.sourcePath}`}>
          <DotLeaderRow
            label={`   ${config.toolId}`}
            metadata={relativizeHome(config.sourcePath, homeDir)}
            width={ROW_WIDTH}
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
