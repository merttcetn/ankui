import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill, SkillKind, ToolId } from "../../types.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { groupSkillsByKind } from "../util/skill-grouping.js";

export interface UserScopeDrillInProps {
  toolId: ToolId;
  result: MultiProjectScanResult;
}

export function UserScopeDrillIn({ toolId, result }: UserScopeDrillInProps): React.ReactElement {
  const tool = result.userScope.tools.find((t) => t.id === toolId);
  const skills = tool?.skills ?? [];
  const groups = groupSkillsByKind(skills);

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["ankui", toolId, "user"]} />

      <Box marginTop={1} flexDirection="column">
        <Text>{toolId} · user scope</Text>
        {tool && <Text dimColor>{tool.detectedPaths.join(" · ")}</Text>}
      </Box>

      {groups.size === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No skills configured at user scope.</Text>
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
