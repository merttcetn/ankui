import type {
  AccessLevel,
  AITool,
  CapabilityCategory,
  MultiProjectScanResult,
  ScanResult,
  Skill,
  ToolId
} from "../../types.js";
import { isSecretLikeKey } from "../../scanner/safety.js";

export interface McpConfiguration {
  toolId: ToolId;
  scope: Skill["scope"];
  sourcePath: string;
  envKeys: ReadonlyArray<string>;
}

export interface McpGroup {
  name: string;
  capabilityCategories: ReadonlyArray<CapabilityCategory>;
  accessLevel: AccessLevel;
  configurations: ReadonlyArray<McpConfiguration>;
  secretEnvKeys: ReadonlyArray<string>;
  duplicatedAcrossTools: boolean;
}

/**
 * Aggregates every `mcp_server` skill in the multi-project result —
 * user-scope and every project — into one ordered list of groups keyed by
 * canonical (lowercased) name. Mirrors `formatMcpOverview`'s grouping rules:
 *
 * - Sort: most configurations first, then name ascending (case-insensitive).
 * - `duplicatedAcrossTools` is true when ≥2 unique `toolId`s contribute.
 * - `secretEnvKeys` are env keys flagged by `isSecretLikeKey`, deduped, sorted.
 */
export function aggregateMcps(result: MultiProjectScanResult): McpGroup[] {
  const map = new Map<string, McpGroupBuilder>();

  collectFromScan(result.userScope, map);
  for (const project of result.projects) {
    collectFromScan(project.scan, map);
  }

  const groups: McpGroup[] = [];
  for (const builder of map.values()) {
    const toolSet = new Set<ToolId>(builder.configurations.map((c) => c.toolId));
    const allEnvKeys = new Set<string>();
    for (const config of builder.configurations) {
      for (const key of config.envKeys) allEnvKeys.add(key);
    }
    const secretEnvKeys = [...allEnvKeys].filter(isSecretLikeKey).sort();
    groups.push({
      name: builder.name,
      capabilityCategories: builder.capabilityCategories,
      accessLevel: builder.accessLevel,
      configurations: builder.configurations,
      secretEnvKeys,
      duplicatedAcrossTools: toolSet.size >= 2
    });
  }

  groups.sort((a, b) => {
    if (a.configurations.length !== b.configurations.length) {
      return b.configurations.length - a.configurations.length;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return groups;
}

interface McpGroupBuilder {
  name: string;
  capabilityCategories: ReadonlyArray<CapabilityCategory>;
  accessLevel: AccessLevel;
  configurations: McpConfiguration[];
}

function collectFromScan(scan: ScanResult, map: Map<string, McpGroupBuilder>): void {
  for (const tool of scan.tools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;
      addSkill(map, tool, skill);
    }
  }
}

function addSkill(
  map: Map<string, McpGroupBuilder>,
  tool: AITool,
  skill: Skill
): void {
  const key = skill.name.toLowerCase();
  const configuration: McpConfiguration = {
    toolId: tool.id,
    scope: skill.scope,
    sourcePath: skill.sourcePath,
    envKeys: readEnvKeys(skill.details)
  };
  const existing = map.get(key);
  if (existing) {
    existing.configurations.push(configuration);
    return;
  }
  map.set(key, {
    name: skill.name,
    capabilityCategories: skill.capabilityCategories,
    accessLevel: skill.accessLevel,
    configurations: [configuration]
  });
}

function readEnvKeys(details: Skill["details"]): ReadonlyArray<string> {
  if (!details || typeof details !== "object") return [];
  const raw = (details as Record<string, unknown>).envKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string");
}

/** Returns the `"<capabilities> · <level>"` tag, or `"(uncatalogued)"` when unknown. */
export function formatCapabilityTag(group: McpGroup): string {
  if (
    group.accessLevel === "unknown" ||
    (group.capabilityCategories.length === 1 && group.capabilityCategories[0] === "unknown")
  ) {
    return "(uncatalogued)";
  }
  return `${group.capabilityCategories.join(", ")} · ${group.accessLevel}`;
}
