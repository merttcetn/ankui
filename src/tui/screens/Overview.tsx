import React from "react";
import { Box, Text } from "ink";

import type { AITool, MultiProjectScanResult } from "../../types.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";

const ROW_WIDTH = 60;

export interface OverviewProps {
  result: MultiProjectScanResult;
}

export function Overview({ result }: OverviewProps): React.ReactElement {
  const totals = computeOverviewTotals(result);

  return (
    <Box flexDirection="column">
      <SectionHeader label="OVERVIEW" />
      <Text>
        {totals.detectedCount} detected · {totals.skills} skills · {totals.mcpConfigs} MCP configs ({totals.uniqueMcps} unique) · {totals.findings} findings
      </Text>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="PER TOOL" />
        {result.userScope.tools.map((tool) => (
          <DotLeaderRow
            key={tool.id}
            label={tool.name}
            metadata={formatToolMetadata(tool, result)}
            width={ROW_WIDTH}
          />
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="CROSS TOOL" />
        <Text>
          {totals.uniqueMcps} unique MCPs · {totals.duplicatedMcps} duplicated cross-tool
        </Text>
        <Text>
          {totals.findings} access findings · {totals.warnings} scanner warnings
        </Text>
      </Box>
    </Box>
  );
}

function formatToolMetadata(tool: AITool, result: MultiProjectScanResult): string {
  if (!tool.detected) return "not detected";
  const userScopeSkills = tool.skills.length;
  const projectSkills = result.projects.reduce((sum, project) => {
    const projectTool = project.scan.tools.find((t) => t.id === tool.id);
    return sum + (projectTool?.skills.length ?? 0);
  }, 0);
  const mcpCount = tool.stats.mcpServers;
  if (userScopeSkills === 0 && projectSkills === 0 && mcpCount === 0) {
    return "detected, no skills";
  }
  return `${userScopeSkills} user · ${projectSkills} project · ${mcpCount} MCPs`;
}

interface OverviewTotals {
  detectedCount: number;
  skills: number;
  mcpConfigs: number;
  uniqueMcps: number;
  duplicatedMcps: number;
  findings: number;
  warnings: number;
}

function computeOverviewTotals(result: MultiProjectScanResult): OverviewTotals {
  const { userScope, projects, warnings } = result;
  const userTools = userScope.tools;

  const detectedCount = userTools.filter((t) => t.detected).length;
  const userScopeSkills = userTools.reduce((n, t) => n + t.skills.length, 0);
  const projectSkills = projects.reduce(
    (n, p) => n + p.scan.tools.reduce((m, t) => m + t.skills.length, 0),
    0
  );

  const mcpNames = new Set<string>();
  const mcpAppearances = new Map<string, Set<string>>();
  let mcpConfigs = 0;

  for (const tool of userTools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;
      const key = skill.name.toLowerCase();
      mcpNames.add(key);
      mcpConfigs += 1;
      const set = mcpAppearances.get(key) ?? new Set<string>();
      set.add(tool.id);
      mcpAppearances.set(key, set);
    }
  }

  for (const project of projects) {
    for (const tool of project.scan.tools) {
      for (const skill of tool.skills) {
        if (skill.kind !== "mcp_server") continue;
        const key = skill.name.toLowerCase();
        mcpNames.add(key);
        mcpConfigs += 1;
        const set = mcpAppearances.get(key) ?? new Set<string>();
        set.add(tool.id);
        mcpAppearances.set(key, set);
      }
    }
  }

  let duplicated = 0;
  for (const set of mcpAppearances.values()) {
    if (set.size >= 2) duplicated += 1;
  }

  const findings = userScope.findings.length;

  return {
    detectedCount,
    skills: userScopeSkills + projectSkills,
    mcpConfigs,
    uniqueMcps: mcpNames.size,
    duplicatedMcps: duplicated,
    findings,
    warnings: warnings.length
  };
}
