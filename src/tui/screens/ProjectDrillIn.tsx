import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill, SkillKind, ToolId } from "../../types.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";
import { groupSkillsByKind } from "../util/skill-grouping.js";

export interface ProjectDrillInProps {
  toolId: ToolId;
  projectPath: string;
  result: MultiProjectScanResult;
}

export function ProjectDrillIn({
  toolId,
  projectPath,
  result
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
  const groups = groupSkillsByKind(skills);

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["ankui", toolId, project.displayPath]} />

      <Box marginTop={1} flexDirection="column">
        <Text>{project.displayPath}</Text>
        <Text dimColor>{project.projectPath}</Text>
      </Box>

      {groups.size === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>No skills for this tool in this project.</Text>
          <Box marginTop={1}>
            <EmptyStateWhisper text={EMPTY_STATE_WHISPERS.noProjectSkills} />
          </Box>
        </Box>
      ) : (
        [...groups.entries()].map(([kind, list]) => renderKindSection(kind, list))
      )}
    </Box>
  );
}

function renderKindSection(kind: SkillKind, skills: ReadonlyArray<Skill>): React.ReactElement {
  return (
    <Box key={kind} marginTop={1} flexDirection="column">
      <SectionHeader label={`${kind.toUpperCase()} (${skills.length})`} />
      {skills.map((skill) => (
        <Text key={skill.id}>{`  ${skill.name}`}</Text>
      ))}
    </Box>
  );
}
