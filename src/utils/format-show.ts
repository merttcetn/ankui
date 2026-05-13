import { TOOL_DEFINITIONS, type AITool, type ScanResult, type Skill, type SkillKind } from "../types.js";
import { relativizeHome } from "./paths.js";

const KIND_ORDER: ReadonlyArray<SkillKind> = [
  "mcp_server",
  "agent_skill",
  "skills_sh_skill",
  "custom_agents",
  "custom_commands",
  "custom_prompts",
  "custom_tools",
  "rules",
  "plugins",
  "memory_file"
];

export class ToolNotFoundError extends Error {
  constructor(toolId: string) {
    const valid = TOOL_DEFINITIONS.map((t) => t.id).join(", ");
    super(`Unknown tool '${toolId}'. Valid tools: ${valid}.`);
    this.name = "ToolNotFoundError";
  }
}

export function formatShow(result: ScanResult, toolId: string): string {
  const tool = findTool(result, toolId);

  const header = `Ankui — ${tool.id}`;
  if (!tool.detected) {
    return [header, "", "Not detected on this machine."].join("\n");
  }

  const pathSection = formatDetectedPaths(tool, result.cwd, result.homeDir);

  if (tool.skills.length === 0) {
    return [header, "", pathSection, "", "No skills configured for this tool."].join("\n");
  }

  const skillSections = formatSkillSections(tool.skills, result.homeDir);
  return [header, "", pathSection, "", ...skillSections].join("\n").replace(/\n+$/, "");
}

function findTool(result: ScanResult, toolId: string): AITool {
  const isKnown = TOOL_DEFINITIONS.some((t) => t.id === toolId);
  if (!isKnown) throw new ToolNotFoundError(toolId);
  const tool = result.tools.find((t) => t.id === toolId);
  if (!tool) {
    throw new ToolNotFoundError(toolId);
  }
  return tool;
}

function formatDetectedPaths(tool: AITool, cwd: string, homeDir: string): string {
  const userPaths: string[] = [];
  const projectPaths: string[] = [];
  for (const path of tool.detectedPaths) {
    const classified = classifyAndRelativize(path, cwd, homeDir);
    (classified.scope === "project" ? projectPaths : userPaths).push(classified.display);
  }

  const lines: string[] = ["Detected at:"];
  if (userPaths.length > 0) {
    lines.push("  user:");
    for (const p of userPaths) lines.push(`    ${p}`);
  }
  if (projectPaths.length > 0) {
    lines.push("  project:");
    for (const p of projectPaths) lines.push(`    ${p}`);
  }
  return lines.join("\n");
}

function classifyAndRelativize(
  filePath: string,
  cwd: string,
  homeDir: string
): { scope: "user" | "project"; display: string } {
  if (cwd && (filePath === cwd || filePath.startsWith(cwd + "/"))) {
    const rel = filePath.slice(cwd.length);
    return { scope: "project", display: rel.length === 0 ? "." : `.${rel}` };
  }
  return { scope: "user", display: relativizeHome(filePath, homeDir) };
}

function formatSkillSections(skills: ReadonlyArray<Skill>, homeDir: string): string[] {
  const byKind = new Map<SkillKind, Skill[]>();
  for (const kind of KIND_ORDER) byKind.set(kind, []);
  for (const skill of skills) {
    const list = byKind.get(skill.kind);
    if (list) list.push(skill);
  }

  const sections: string[] = [];
  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind) ?? [];
    if (list.length === 0) continue;

    const heading = `${kind} (${list.length})`;
    const underline = "─".repeat(heading.length);
    const rows = [...list]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((s) => formatSkillRow(s, homeDir));
    sections.push([heading, underline, ...rows, ""].join("\n"));
  }
  return sections;
}

function formatSkillRow(skill: Skill, homeDir: string): string {
  const namePadded = skill.name.padEnd(36);
  const path = relativizeHome(skill.sourcePath, homeDir);
  const tag = formatCapabilityTag(skill);
  return tag
    ? `  ${namePadded} ${tag.padEnd(28)} ${path}`
    : `  ${namePadded} ${path}`;
}

function formatCapabilityTag(skill: Skill): string {
  if (skill.kind !== "mcp_server") return "";
  if (skill.accessLevel === "unknown") return "";
  if (skill.capabilityCategories.length === 1 && skill.capabilityCategories[0] === "unknown") return "";
  return `${skill.capabilityCategories.join(", ")} · ${skill.accessLevel}`;
}

export function formatShowJson(result: ScanResult, toolId: string): string {
  const tool = findTool(result, toolId);

  const skillsByKind: Record<SkillKind, Skill[]> = {
    mcp_server: [],
    agent_skill: [],
    skills_sh_skill: [],
    custom_agents: [],
    custom_commands: [],
    custom_prompts: [],
    custom_tools: [],
    rules: [],
    plugins: [],
    memory_file: []
  };

  for (const skill of tool.skills) {
    if (skillsByKind[skill.kind]) {
      skillsByKind[skill.kind].push(skill);
    }
  }

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    tool: tool.id,
    detected: tool.detected,
    detectedPaths: tool.detectedPaths,
    stats: tool.stats,
    skillsByKind
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
