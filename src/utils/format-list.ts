import type { AITool, ScanResult, Skill, SkillKind, ToolId } from "../types.js";
import { TOOL_DEFINITIONS } from "../types.js";
import { relativizeHome } from "./paths.js";

export interface ListFilters {
  kind?: SkillKind;
  tool?: ToolId;
}

const ALL_TOOL_IDS = TOOL_DEFINITIONS.map((t) => t.id);

export function formatList(result: ScanResult, filters: ListFilters): string {
  const allSkills = collectSkills(result.tools, filters);

  if (allSkills.length === 0) {
    return emptyMessage(filters);
  }

  const header = formatHeader(allSkills.length, filters);
  const byTool = groupSkillsByTool(allSkills, result.tools);

  const sections: string[] = [];
  for (const tool of result.tools) {
    const skills = byTool.get(tool.id);
    if (!skills || skills.length === 0) continue;
    sections.push(formatToolSection(tool, skills, result.homeDir));
  }

  return [header, "", ...sections].join("\n").replace(/\n+$/, "");
}

function collectSkills(tools: ReadonlyArray<AITool>, filters: ListFilters): Skill[] {
  const out: Skill[] = [];
  for (const tool of tools) {
    if (filters.tool && tool.id !== filters.tool) continue;
    for (const skill of tool.skills) {
      if (filters.kind && skill.kind !== filters.kind) continue;
      out.push(skill);
    }
  }
  return out;
}

function formatHeader(count: number, filters: ListFilters): string {
  const clauses: string[] = [];
  if (filters.kind) clauses.push(`kind=${filters.kind}`);
  if (filters.tool) clauses.push(`tool=${filters.tool}`);
  const filterTail = clauses.length > 0 ? ` (filter: ${clauses.join(", ")})` : "";
  const noun = filters.kind ? `${filters.kind} skills` : "skills";
  return `Ankui — ${count} ${noun}${filterTail}`;
}

function groupSkillsByTool(
  skills: ReadonlyArray<Skill>,
  tools: ReadonlyArray<AITool>
): Map<AITool["id"], Skill[]> {
  const map = new Map<AITool["id"], Skill[]>();
  for (const tool of tools) map.set(tool.id, []);
  for (const skill of skills) {
    const list = map.get(skill.toolId);
    if (list) list.push(skill);
  }
  return map;
}

function formatToolSection(tool: AITool, skills: ReadonlyArray<Skill>, homeDir: string): string {
  const heading = `${tool.id} (${skills.length})`;
  const underline = "─".repeat(heading.length);
  const rows = [...skills]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map((s) => formatSkillRow(s, homeDir));
  return [heading, underline, ...rows, ""].join("\n");
}

function formatSkillRow(skill: Skill, homeDir: string): string {
  const kindPadded = skill.kind.padEnd(15);
  const namePadded = skill.name.padEnd(36);
  const path = relativizeHome(skill.sourcePath, homeDir);
  const tag = formatCapabilityTag(skill);
  return tag
    ? `  ${kindPadded} ${namePadded} ${path}  ${tag}`
    : `  ${kindPadded} ${namePadded} ${path}`;
}

function formatCapabilityTag(skill: Skill): string {
  if (skill.kind !== "mcp_server") return "";
  if (skill.accessLevel === "unknown") return "";
  if (skill.capabilityCategories.length === 1 && skill.capabilityCategories[0] === "unknown") return "";
  return `${skill.capabilityCategories.join(", ")} · ${skill.accessLevel}`;
}

function emptyMessage(filters: ListFilters): string {
  const clauses: string[] = [];
  if (filters.kind) clauses.push(`kind=${filters.kind}`);
  if (filters.tool) clauses.push(`tool=${filters.tool}`);
  if (clauses.length === 0) return "Ankui — no skills configured.";
  return `Ankui — no skills match (filter: ${clauses.join(", ")}).`;
}

export function formatListJson(result: ScanResult, filters: ListFilters): string {
  const allSkills = collectSkills(result.tools, filters);

  const byTool: Record<string, Skill[]> = {};
  for (const id of ALL_TOOL_IDS) byTool[id] = [];
  for (const skill of allSkills) {
    if (byTool[skill.toolId]) byTool[skill.toolId].push(skill);
  }

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    filters: {
      kind: filters.kind ?? null,
      tool: filters.tool ?? null
    },
    totalSkills: allSkills.length,
    byTool
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
