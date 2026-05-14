import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, Skill, SkillKind, ToolId } from "../../types.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SearchBox } from "../components/SearchBox.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { groupSkillsByKind } from "../util/skill-grouping.js";

export interface UserScopeDrillInProps {
  toolId: ToolId;
  result: MultiProjectScanResult;
  /** When provided, filters skill names case-insensitively. */
  searchQuery?: string;
  /** When true, renders SearchBox above the skill list. */
  searchOpen?: boolean;
}

export function UserScopeDrillIn({
  toolId,
  result,
  searchQuery,
  searchOpen
}: UserScopeDrillInProps): React.ReactElement {
  const tool = result.userScope.tools.find((t) => t.id === toolId);
  const allSkills = tool?.skills ?? [];
  const filtered = applyFilter(allSkills, searchQuery);
  const groups = groupSkillsByKind(filtered);

  return (
    <Box flexDirection="column">
      <Breadcrumb parts={["ankui", toolId, "user"]} />

      <Box marginTop={1} flexDirection="column">
        <Text>{toolId} · user scope</Text>
        {tool && <Text dimColor>{tool.detectedPaths.join(" · ")}</Text>}
      </Box>

      {searchOpen && (
        <Box marginTop={1}>
          <SearchBox query={searchQuery ?? ""} />
        </Box>
      )}

      {groups.size === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>
            {searchQuery && searchQuery.length > 0
              ? "No skills match your filter."
              : "No skills configured at user scope."}
          </Text>
        </Box>
      ) : (
        [...groups.entries()].map(([kind, list]) => renderKindSection(kind, list))
      )}
    </Box>
  );
}

function applyFilter(
  skills: ReadonlyArray<Skill>,
  query: string | undefined
): ReadonlyArray<Skill> {
  if (!query || query.length === 0) return skills;
  const needle = query.toLowerCase();
  return skills.filter((skill) => skill.name.toLowerCase().includes(needle));
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
