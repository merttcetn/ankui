import React from "react";
import { Box, Text } from "ink";

import type {
  AITool,
  MultiProjectScanResult,
  ProjectScan,
  ToolId
} from "../../types.js";
import type { TuiAction } from "../state/tui-state.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { usePanelWidth } from "../util/panel-width.js";

export interface ToolTabProps {
  toolId: ToolId;
  result: MultiProjectScanResult;
  dispatch: React.Dispatch<TuiAction>;
}

export function ToolTab({ toolId, result, dispatch }: ToolTabProps): React.ReactElement {
  void dispatch;
  const panelWidth = usePanelWidth();

  const tool = result.userScope.tools.find((t) => t.id === toolId);
  if (!tool || !tool.detected) {
    return (
      <Box flexDirection="column">
        <SectionHeader label={toolId.toUpperCase()} underlineWidth={panelWidth} />
        <Text>Not detected on this machine.</Text>
      </Box>
    );
  }

  const projectsWithSkills = result.projects.filter((project) => {
    const projectTool = project.scan.tools.find((t) => t.id === toolId);
    return projectTool && projectTool.skills.length > 0;
  });

  return (
    <Box flexDirection="column">
      <SectionHeader label={toolId.toUpperCase()} underlineWidth={panelWidth} />
      <Text>{formatSummary(tool, projectsWithSkills)}</Text>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="USER SCOPE" underlineWidth={panelWidth} />
        <Text dimColor>{tool.detectedPaths.join(" · ")}</Text>
        {Object.entries(tool.stats)
          .filter(([, count]) => typeof count === "number" && (count as number) > 0)
          .map(([kind, count]) => (
            <DotLeaderRow
              key={kind}
              label={kind}
              metadata={String(count)}
              width={panelWidth}
            />
          ))}
      </Box>

      {projectsWithSkills.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <SectionHeader label="PROJECTS" underlineWidth={panelWidth} />
          {projectsWithSkills.map((project) => (
            <DotLeaderRow
              key={project.projectPath}
              label={project.displayPath}
              metadata={formatProjectMetadata(project, toolId)}
              width={panelWidth}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function formatSummary(
  tool: AITool,
  projectsWithSkills: ReadonlyArray<ProjectScan>
): string {
  const userSkills = tool.skills.length;
  const projectConfigs = projectsWithSkills.length;
  const userMcps = tool.stats.mcpServers;
  const findings = tool.findings.length;
  return `${userSkills} user skills · ${projectConfigs} project configs · ${userMcps} MCPs · ${findings} findings`;
}

function formatProjectMetadata(project: ProjectScan, toolId: ToolId): string {
  const projectTool = project.scan.tools.find((t) => t.id === toolId);
  if (!projectTool) return "0 skills";
  const skillCount = projectTool.skills.length;
  const mcpCount = projectTool.stats.mcpServers;
  const parts = [`${skillCount} skills`];
  if (mcpCount > 0) parts.push(`${mcpCount} MCP${mcpCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
