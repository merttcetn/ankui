import type { AccessLevel, AITool, CapabilityCategory, ScanResult } from "../types.js";

interface CategorizedMcp {
  name: string;
  accessLevel: AccessLevel;
  tools: ReadonlyArray<AITool["id"]>;
}

interface CategoryGroup {
  category: CapabilityCategory;
  mcps: CategorizedMcp[];
}

export function formatCapabilities(result: ScanResult): string {
  const groups = groupMcpsByCategory(result.tools);
  if (groups.length === 0) {
    return "Ankui capabilities — no classified MCPs.";
  }

  const uniqueMcps = countUniqueMcps(result.tools);
  const header =
    `Ankui capabilities — ${plural(uniqueMcps, "classified MCP")} across ` +
    `${plural(groups.length, "category")}`;

  const sections = groups.map(formatCategory);

  const uncatalogued = collectUncataloguedKinds(result.tools);
  const footer =
    uncatalogued.totalCount > 0
      ? [
          "──────────────────────────────────────────────────────────────────────",
          `${uncatalogued.totalCount} uncatalogued skills (${uncatalogued.kinds.join(", ")}).`,
          "Ankui classifies MCP servers; markdown-backed skills are not classified",
          "in this version. Use `ankui show <tool>` for per-tool listing."
        ].join("\n")
      : "";

  const parts = [header, "", ...sections];
  if (footer) parts.push(footer);
  return parts.join("\n").replace(/\n+$/, "");
}

function collectUncataloguedKinds(
  tools: ReadonlyArray<AITool>
): { totalCount: number; kinds: string[] } {
  const kindSet = new Set<string>();
  let count = 0;
  for (const tool of tools) {
    for (const skill of tool.skills) {
      const isUncatalogued =
        skill.accessLevel === "unknown" ||
        (skill.capabilityCategories.length === 1 && skill.capabilityCategories[0] === "unknown");
      if (!isUncatalogued) continue;
      count += 1;
      kindSet.add(skill.kind);
    }
  }
  return { totalCount: count, kinds: [...kindSet].sort() };
}

function formatCategory(group: CategoryGroup): string {
  const heading = `${group.category} (${group.mcps.length})`;
  const underline = "─".repeat(heading.length);
  const rows = group.mcps.map((mcp) => formatMcpRow(mcp));
  return [heading, underline, ...rows, ""].join("\n");
}

function formatMcpRow(mcp: CategorizedMcp): string {
  const namePadded = mcp.name.padEnd(12);
  const tools = mcp.tools.join(", ").padEnd(24);
  return `  ${namePadded} ${tools} ${mcp.accessLevel}`;
}

function groupMcpsByCategory(tools: ReadonlyArray<AITool>): CategoryGroup[] {
  const byName = new Map<
    string,
    { name: string; accessLevel: AccessLevel; categories: CapabilityCategory[]; tools: Set<AITool["id"]> }
  >();

  for (const tool of tools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;
      if (skill.accessLevel === "unknown") continue;
      if (skill.capabilityCategories.length === 1 && skill.capabilityCategories[0] === "unknown") continue;

      const key = skill.name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.tools.add(tool.id);
      } else {
        byName.set(key, {
          name: skill.name,
          accessLevel: skill.accessLevel,
          categories: [...skill.capabilityCategories],
          tools: new Set([tool.id])
        });
      }
    }
  }

  const byCategory = new Map<CapabilityCategory, CategorizedMcp[]>();
  for (const mcp of byName.values()) {
    const toolList = [...mcp.tools].sort();
    for (const category of mcp.categories) {
      const list = byCategory.get(category) ?? [];
      list.push({ name: mcp.name, accessLevel: mcp.accessLevel, tools: toolList });
      byCategory.set(category, list);
    }
  }

  const groups: CategoryGroup[] = [];
  for (const [category, mcps] of byCategory) {
    mcps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    groups.push({ category, mcps });
  }
  groups.sort((a, b) => {
    if (a.mcps.length !== b.mcps.length) return b.mcps.length - a.mcps.length;
    return a.category.localeCompare(b.category);
  });

  return groups;
}

function countUniqueMcps(tools: ReadonlyArray<AITool>): number {
  const seen = new Set<string>();
  for (const tool of tools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;
      if (skill.accessLevel === "unknown") continue;
      if (skill.capabilityCategories.length === 1 && skill.capabilityCategories[0] === "unknown") continue;
      seen.add(skill.name.toLowerCase());
    }
  }
  return seen.size;
}

function plural(n: number, noun: string): string {
  if (noun.endsWith("y")) return `${n} ${noun.slice(0, -1)}${n === 1 ? "y" : "ies"}`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function formatCapabilitiesJson(result: ScanResult): string {
  const groups = groupMcpsByCategory(result.tools);
  const uniqueMcps = countUniqueMcps(result.tools);
  const uncatalogued = collectUncataloguedKinds(result.tools);

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    totalClassifiedMcps: uniqueMcps,
    totalCategories: groups.length,
    uncataloguedSkillCount: uncatalogued.totalCount,
    categories: groups.map((g) => ({
      category: g.category,
      mcpCount: g.mcps.length,
      mcps: g.mcps.map((m) => ({
        name: m.name,
        accessLevel: m.accessLevel,
        tools: [...m.tools]
      }))
    }))
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
