import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { SearchBox } from "../components/SearchBox.js";
import { SkillViewport } from "../components/SkillViewport.js";
import { filterSkillsByQuery } from "../util/skill-filter.js";

export interface UserScopeDrillInProps {
  toolId: ToolId;
  result: MultiProjectScanResult;
  /** Cursor into the filtered, grouped skill list. */
  cursor?: number;
  /** When provided, filters skill names case-insensitively. */
  searchQuery?: string;
  /** When true, renders SearchBox above the skill list. */
  searchOpen?: boolean;
}

export function UserScopeDrillIn({
  toolId,
  result,
  cursor = 0,
  searchQuery,
  searchOpen
}: UserScopeDrillInProps): React.ReactElement {
  const tool = result.userScope.tools.find((t) => t.id === toolId);
  const allSkills = tool?.skills ?? [];
  const filtered = filterSkillsByQuery(allSkills, searchQuery);

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

      {filtered.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>
            {searchQuery && searchQuery.length > 0
              ? "No skills match your filter."
              : "No skills configured at user scope."}
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SkillViewport skills={filtered} cursor={cursor} />
        </Box>
      )}
    </Box>
  );
}
