export type ToolId =
  | "claude"
  | "codex"
  | "cursor"
  | "gemini"
  | "opencode"
  | "skills-sh";

export type SkillKind =
  | "mcp_server"
  | "custom_commands"
  | "custom_agents"
  | "custom_prompts"
  | "custom_tools"
  | "plugins"
  | "rules"
  | "memory_file"
  | "agent_skill"
  | "skills_sh_skill";

export type SkillSource = "config" | "directory";
export type Scope = "user" | "project";
export type FindingScope = Scope | "cross_tool";
export type AccessLevel = "limited" | "moderate" | "broad" | "unknown";

export type CapabilityCategory =
  | "filesystem"
  | "network"
  | "browser"
  | "database"
  | "code_hosting"
  | "communication"
  | "shell"
  | "memory"
  | "automation"
  | "unknown";

export interface Skill {
  id: string;
  toolId: ToolId;
  kind: SkillKind;
  name: string;
  summary: string;
  scope: Scope;
  sourcePath: string;
  source: SkillSource;
  capabilityCategories: CapabilityCategory[];
  accessLevel: AccessLevel;
  details?: Record<string, unknown>;
}

export interface Finding {
  id: string;
  toolIds: ToolId[];
  title: string;
  message: string;
  category:
    | "broad_access_capability"
    | "unknown_capability"
    | "secret_reference"
    | "duplicate_mcp"
    | "dangerous_pattern"
    | "skipped_sensitive_file"
    | "parse_issue";
  accessLevel: AccessLevel;
  scope: FindingScope;
  sourcePaths: string[];
  relatedSkillIds: string[];
  recommendation: string;
}

export interface Warning {
  id: string;
  message: string;
  path?: string;
  reason:
    | "sensitive_file_skipped"
    | "file_too_large"
    | "parse_failed"
    | "adapter_timeout"
    | "permission_denied"
    | "remote_reference_skipped"
    | "non_disk_config_skipped"
    | "symlink_skipped"
    | "unknown";
}

export interface ToolStats {
  mcpServers: number;
  customCommands: number;
  customAgents: number;
  customPrompts: number;
  customTools: number;
  plugins: number;
  rules: number;
  memoryFiles: number;
  agentSkills: number;
  skillsShSkills: number;
  findings: number;
}

export interface AITool {
  id: ToolId;
  name: string;
  description: string;
  detected: boolean;
  detectedPaths: string[];
  skills: Skill[];
  findings: Finding[];
  warnings: Warning[];
  stats: ToolStats;
}

export interface ScanSummary {
  detectedTools: number;
  totalSkills: number;
  totalMcpServers: number;
  uniqueMcpServers: number;
  customCommands: number;
  customTools: number;
  plugins: number;
  memoryFiles: number;
  agentSkills: number;
  skillsShSkills: number;
  totalFindings: number;
  broadAccessFindings: number;
}

export interface ScanResult {
  scannedAt: string;
  cwd: string;
  homeDir: string;
  tools: AITool[];
  findings: Finding[];
  warnings: Warning[];
  summary: ScanSummary;
}

export interface MultiProjectTotals {
  projectCount: number;
  skillsAcrossProjects: number;
  userScopeSkills: number;
}

export interface ProjectScan {
  projectPath: string;
  displayPath: string;
  scan: ScanResult;
}

export interface MultiProjectScanResult {
  scannedAt: string;
  cwd: string;
  homeDir: string;
  devRoots: string[];
  userScope: ScanResult;
  projects: ProjectScan[];
  warnings: Warning[];
  totals: MultiProjectTotals;
}

export function createMultiProjectTotals(input: {
  userScopeSkillCount: number;
  projectSkillCounts: readonly number[];
}): MultiProjectTotals {
  const skillsAcrossProjects = input.projectSkillCounts.reduce((sum, n) => sum + n, 0);
  return {
    projectCount: input.projectSkillCounts.length,
    skillsAcrossProjects,
    userScopeSkills: input.userScopeSkillCount
  };
}

export const TOOL_DEFINITIONS = [
  {
    id: "claude",
    name: "Claude",
    description: "Claude Code local configuration and extensions."
  },
  {
    id: "codex",
    name: "Codex",
    description: "Codex local configuration, prompts, and MCP servers."
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Cursor local MCP configuration and project rules."
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Gemini CLI local configuration and commands."
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode local agents, commands, tools, plugins, and skills."
  },
  {
    id: "skills-sh",
    name: "skills.sh",
    description: "skills.sh-compatible local skill directories."
  }
] as const satisfies ReadonlyArray<{
  id: ToolId;
  name: string;
  description: string;
}>;

export function createToolStats(
  skills: readonly Skill[] = [],
  findings: readonly Finding[] = []
): ToolStats {
  return {
    mcpServers: countSkills(skills, "mcp_server"),
    customCommands: countSkills(skills, "custom_commands"),
    customAgents: countSkills(skills, "custom_agents"),
    customPrompts: countSkills(skills, "custom_prompts"),
    customTools: countSkills(skills, "custom_tools"),
    plugins: countSkills(skills, "plugins"),
    rules: countSkills(skills, "rules"),
    memoryFiles: countSkills(skills, "memory_file"),
    agentSkills: countSkills(skills, "agent_skill"),
    skillsShSkills: countSkills(skills, "skills_sh_skill"),
    findings: findings.length
  };
}

export function createEmptyStats(): ToolStats {
  return createToolStats();
}

export function createEmptyTool(toolId: ToolId): AITool {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.id === toolId);

  if (!definition) {
    throw new Error(`Unknown tool id: ${toolId}`);
  }

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    detected: false,
    detectedPaths: [],
    skills: [],
    findings: [],
    warnings: [],
    stats: createEmptyStats()
  };
}

export function createAllEmptyTools(): AITool[] {
  return TOOL_DEFINITIONS.map((tool) => createEmptyTool(tool.id));
}

export function createWarning(input: Omit<Warning, "id"> & { id?: string }): Warning {
  return {
    id: input.id ?? normalizeId(["warning", input.reason, input.path ?? input.message]),
    message: input.message,
    path: input.path,
    reason: input.reason
  };
}

export function createFinding(input: Omit<Finding, "id"> & { id?: string }): Finding {
  return {
    id:
      input.id ??
      normalizeId([
        "finding",
        input.category,
        input.title,
        ...input.toolIds
      ]),
    toolIds: input.toolIds,
    title: input.title,
    message: input.message,
    category: input.category,
    accessLevel: input.accessLevel,
    scope: input.scope,
    sourcePaths: input.sourcePaths,
    relatedSkillIds: input.relatedSkillIds,
    recommendation: input.recommendation
  };
}

export function createSkillId(input: {
  toolId: ToolId;
  kind: SkillKind;
  name: string;
  sourcePath: string;
}): string {
  return normalizeId([input.toolId, input.kind, input.name, input.sourcePath]);
}

export function createScanSummary(tools: AITool[]): ScanSummary {
  const allSkills = tools.flatMap((tool) => tool.skills);
  const allFindings = tools.flatMap((tool) => tool.findings);
  const uniqueMcpServers = new Set(
    allSkills
      .filter((skill) => skill.kind === "mcp_server")
      .map((skill) => skill.name.toLowerCase())
  );

  return {
    detectedTools: tools.filter((tool) => tool.detected).length,
    totalSkills: allSkills.length,
    totalMcpServers: tools.reduce((count, tool) => count + tool.stats.mcpServers, 0),
    uniqueMcpServers: uniqueMcpServers.size,
    customCommands: tools.reduce((count, tool) => count + tool.stats.customCommands, 0),
    customTools: tools.reduce((count, tool) => count + tool.stats.customTools, 0),
    plugins: tools.reduce((count, tool) => count + tool.stats.plugins, 0),
    memoryFiles: tools.reduce((count, tool) => count + tool.stats.memoryFiles, 0),
    agentSkills: tools.reduce((count, tool) => count + tool.stats.agentSkills, 0),
    skillsShSkills: tools.reduce((count, tool) => count + tool.stats.skillsShSkills, 0),
    totalFindings: allFindings.length,
    broadAccessFindings: allFindings.filter((finding) => finding.accessLevel === "broad").length
  };
}

function normalizeId(parts: string[]): string {
  return parts
    .join(":")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function countSkills(skills: readonly Skill[], kind: SkillKind): number {
  return skills.filter((skill) => skill.kind === kind).length;
}
