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
import {
  clipHint,
  useAvailableContentRows,
  usePanelWidth
} from "../util/panel-width.js";

export interface ToolTabProps {
  toolId: ToolId;
  result: MultiProjectScanResult;
  dispatch: React.Dispatch<TuiAction>;
}

export function ToolTab({ toolId, result, dispatch }: ToolTabProps): React.ReactElement {
  void dispatch;
  const panelWidth = usePanelWidth();

  const tool = result.userScope.tools.find((t) => t.id === toolId);

  const visibleStats = tool
    ? Object.entries(tool.stats).filter(
        ([, count]) => typeof count === "number" && count > 0
      )
    : [];

  // Fixed-overhead rows this screen renders before the projects list.
  // SectionHeader renders TWO rows (label + underline), not one.
  //   2 tool SectionHeader + 1 summary Text
  // + 1 marginTop + 2 USER SCOPE SectionHeader + 1 detectedPaths + N stats
  // + 1 marginTop + 2 PROJECTS SectionHeader
  // + 1 reserved for the "+N more" hint
  // Computed before the early return so hook order stays stable (Rules of Hooks).
  const fixedOverhead = 3 + (4 + visibleStats.length) + 3 + 1;
  const projectsBudget = useAvailableContentRows(fixedOverhead);

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

  const visibleProjects = projectsWithSkills.slice(0, Math.max(0, projectsBudget));
  const hiddenProjects = projectsWithSkills.length - visibleProjects.length;
  const projectsHint = clipHint(hiddenProjects);

  return (
    <Box flexDirection="column">
      <SectionHeader label={toolId.toUpperCase()} underlineWidth={panelWidth} />
      <Text>{formatSummary(tool, projectsWithSkills)}</Text>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="USER SCOPE" underlineWidth={panelWidth} />
        <Text dimColor>{tool.detectedPaths.join(" · ")}</Text>
        {visibleStats.map(([kind, count]) => (
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
          {visibleProjects.map((project) => (
            <DotLeaderRow
              key={project.projectPath}
              label={project.displayPath}
              metadata={formatProjectMetadata(project, toolId)}
              width={panelWidth}
            />
          ))}
          {projectsHint !== null && <Text dimColor>{projectsHint}</Text>}
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
