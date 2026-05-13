import type { AccessLevel, AITool, CapabilityCategory, Skill, ScanResult } from "../types.js";
import { isSecretLikeKey } from "../scanner/safety.js";
import { relativizeHome } from "./paths.js";

const TOOL_COL_WIDTH = 10;

interface McpConfig {
  toolId: AITool["id"];
  scope: Skill["scope"];
  sourcePath: string;
  envKeys: ReadonlyArray<string>;
}

interface McpGroup {
  name: string;
  capabilityCategories: ReadonlyArray<CapabilityCategory>;
  accessLevel: AccessLevel;
  configurations: ReadonlyArray<McpConfig>;
}

export function formatMcpOverview(result: ScanResult): string {
  const groups = groupMcpSkills(result.tools);
  if (groups.length === 0) {
    return "Ankui MCP overview — no MCP servers configured.";
  }

  const header = formatHeader(groups);
  const blocks = groups.map((group) => formatGroup(group, result.homeDir));

  return [header, "", ...blocks].join("\n").replace(/\n+$/, "");
}

function formatHeader(groups: ReadonlyArray<McpGroup>): string {
  const totalConfigs = groups.reduce((n, g) => n + g.configurations.length, 0);
  const toolSet = new Set<string>();
  for (const g of groups) for (const c of g.configurations) toolSet.add(c.toolId);
  return (
    `Ankui MCP overview — ${plural(groups.length, "unique server")}, ` +
    `${plural(totalConfigs, "configuration")} across ${plural(toolSet.size, "tool")}`
  );
}

function formatGroup(group: McpGroup, homeDir: string): string {
  const tag = formatCapabilityTag(group);
  const lines: string[] = [`${group.name}  ${tag}`];

  for (const config of group.configurations) {
    lines.push(
      `  ${config.toolId.padEnd(TOOL_COL_WIDTH)}${relativizeHome(config.sourcePath, homeDir)}`
    );
  }

  const uniqueTools = new Set(group.configurations.map((c) => c.toolId));
  if (uniqueTools.size >= 2) {
    lines.push(`  ⚠ Configured in ${uniqueTools.size} tools`);
  }

  const secretEnvKeys = collectSecretEnvKeys(group);
  if (secretEnvKeys.length > 0) {
    lines.push(`  ⚠ Secret-bearing env keys: ${secretEnvKeys.join(", ")}`);
  }

  lines.push("");
  return lines.join("\n");
}

function collectSecretEnvKeys(group: McpGroup): string[] {
  const all = new Set<string>();
  for (const config of group.configurations) {
    for (const key of config.envKeys) {
      all.add(key);
    }
  }
  return [...all].filter(isSecretLikeKey).sort();
}

function formatCapabilityTag(group: McpGroup): string {
  if (
    group.accessLevel === "unknown" ||
    (group.capabilityCategories.length === 1 && group.capabilityCategories[0] === "unknown")
  ) {
    return "(uncatalogued)";
  }
  return `${group.capabilityCategories.join(", ")} · ${group.accessLevel}`;
}

function groupMcpSkills(tools: ReadonlyArray<AITool>): McpGroup[] {
  const map = new Map<string, McpGroup>();

  for (const tool of tools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;

      const key = skill.name.toLowerCase();
      const config: McpConfig = {
        toolId: tool.id,
        scope: skill.scope,
        sourcePath: skill.sourcePath,
        envKeys: readEnvKeys(skill.details)
      };

      const existing = map.get(key);
      if (existing) {
        (existing.configurations as McpConfig[]).push(config);
        continue;
      }

      map.set(key, {
        name: skill.name,
        capabilityCategories: skill.capabilityCategories,
        accessLevel: skill.accessLevel,
        configurations: [config]
      });
    }
  }

  const groups = [...map.values()];
  groups.sort((a, b) => {
    if (a.configurations.length !== b.configurations.length) {
      return b.configurations.length - a.configurations.length;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return groups;
}

function readEnvKeys(details: Skill["details"]): ReadonlyArray<string> {
  if (!details || typeof details !== "object") return [];
  const raw = (details as Record<string, unknown>).envKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string");
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function formatMcpOverviewJson(result: ScanResult): string {
  const groups = groupMcpSkills(result.tools);
  const toolSet = new Set<string>();
  for (const g of groups) for (const c of g.configurations) toolSet.add(c.toolId);

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    totalConfigurations: groups.reduce((n, g) => n + g.configurations.length, 0),
    uniqueServers: groups.length,
    tools: [...toolSet].sort(),
    servers: groups.map((group) => ({
      name: group.name,
      capabilityCategories: group.capabilityCategories,
      accessLevel: group.accessLevel,
      configurations: group.configurations.map((c) => ({
        toolId: c.toolId,
        scope: c.scope,
        sourcePath: c.sourcePath,
        envKeys: c.envKeys
      })),
      secretEnvKeys: collectSecretEnvKeys(group),
      duplicatedAcrossTools: new Set(group.configurations.map((c) => c.toolId)).size >= 2
    }))
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
