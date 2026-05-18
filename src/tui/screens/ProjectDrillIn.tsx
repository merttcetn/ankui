import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SkillViewport } from "../components/SkillViewport.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";

export interface ProjectDrillInProps {
  toolId: ToolId;
  projectPath: string;
  result: MultiProjectScanResult;
  /** Cursor into the grouped skill list. */
  cursor?: number;
}

export function ProjectDrillIn({
  toolId,
  projectPath,
  result,
  cursor = 0
}: ProjectDrillInProps): React.ReactElement {
  const project = result.projects.find((p) => p.projectPath === projectPath);
  if (!project) {
    return (
      <Box flexDirection="column">
        <Breadcrumb parts={["ankui", toolId, "?"]} />
        <Text dimColor>Project not found.</Text>
      </Box>
    );
  }

  const projectTool = project.scan.tools.find((t) => t.id === toolId);
  const skills = projectTool?.skills ?? [];

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["ankui", toolId, project.displayPath]} />

      <Box marginTop={1} flexDirection="column">
        <Text>{project.displayPath}</Text>
        <Text dimColor>{project.projectPath}</Text>
      </Box>

      {skills.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>No skills for this tool in this project.</Text>
          <Box marginTop={1}>
            <EmptyStateWhisper text={EMPTY_STATE_WHISPERS.noProjectSkills} />
          </Box>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SkillViewport skills={skills} cursor={cursor} />
        </Box>
      )}
    </Box>
  );
}
