import type {
  AITool,
  Finding,
  FindingCategory,
  FindingSeverity,
  MultiProjectScanResult,
  Skill,
  ToolId,
  ToolStats,
  Warning
} from "../types.js";
import { TOOL_DEFINITIONS, createEmptyStats } from "../types.js";

export interface SanitizedReportSummary {
  detectedTools: number;
  projects: number;
  totalSkills: number;
  totalMcpServers: number;
  uniqueMcpServers: number;
  totalFindings: number;
  warnings: number;
  bySeverity: Record<FindingSeverity, number>;
}

export interface SanitizedReportTool {
  id: ToolId;
  name: string;
  detected: boolean;
  stats: ToolStats;
  findings: number;
}

export interface SanitizedReportFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  message: string;
  recommendation: string;
  tools: ToolId[];
  scope: Finding["scope"];
  sources: string[];
}

export interface SanitizedReportWarningExample {
  path?: string;
  message: string;
}

export interface SanitizedReportWarningGroup {
  reason: Warning["reason"];
  count: number;
  examples: SanitizedReportWarningExample[];
  omitted: number;
}

export interface SanitizedReportModel {
  version: 1;
  privacy: "strict";
  generatedAt: string;
  scannedAt: string;
  summary: SanitizedReportSummary;
  tools: SanitizedReportTool[];
  findings: SanitizedReportFinding[];
  warningGroups: SanitizedReportWarningGroup[];
  notes: string[];
}

export interface BuildReportOptions {
  generatedAt?: Date | string;
  maxWarningsPerGroup?: number;
}

const DEFAULT_MAX_WARNINGS_PER_GROUP = 10;

const SECRET_KEY_RE =
  /(auth|authorization|token|secret|credential|password|passwd|apikey|api_key|private_key|access_token|refresh_token|auth_token|client_secret)/i;

export function buildSanitizedReportModel(
  result: MultiProjectScanResult,
  options: BuildReportOptions = {}
): SanitizedReportModel {
  const redactor = createPathRedactor(result);
  const skillsById = collectSkillsById(result);
  const scans = [result.userScope, ...result.projects.map((project) => project.scan)];
  const findings = scans.flatMap((scan) => scan.findings);
  const warnings = [
    ...result.warnings,
    ...result.userScope.warnings,
    ...result.projects.flatMap((project) => project.scan.warnings)
  ];

  return {
    version: 1,
    privacy: "strict",
    generatedAt: formatIso(options.generatedAt ?? new Date()),
    scannedAt: result.scannedAt,
    summary: buildSummary(result, findings, warnings),
    tools: buildToolRows(result, findings),
    findings: findings
      .map((finding) => sanitizeFinding(finding, redactor, skillsById))
      .sort(compareReportFinding),
    warningGroups: buildWarningGroups(
      warnings,
      redactor,
      options.maxWarningsPerGroup ?? DEFAULT_MAX_WARNINGS_PER_GROUP
    ),
    notes: [
      "Strict privacy mode anonymizes local paths and omits raw skill previews/details.",
      "Review this report before sharing; tool names, MCP names, and finding titles are preserved for actionability."
    ]
  };
}

export function renderSanitizedReportMarkdown(
  model: SanitizedReportModel
): string {
  const lines = [
    "# Ankui Sanitized Report",
    "",
    `Generated: ${model.generatedAt}`,
    `Scan time: ${model.scannedAt}`,
    `Privacy: ${model.privacy}`,
    "",
    "## Summary",
    "",
    `- Detected tools: ${model.summary.detectedTools}`,
    `- Projects: ${model.summary.projects}`,
    `- Skills: ${model.summary.totalSkills}`,
    `- MCP servers: ${model.summary.totalMcpServers} configured, ${model.summary.uniqueMcpServers} unique`,
    `- Findings: ${model.summary.totalFindings} (${formatSeverityCounts(model.summary.bySeverity)})`,
    `- Warnings: ${model.summary.warnings}`,
    "",
    "## Tool Overview",
    "",
    "| Tool | Status | Skills | MCP | Commands | Tools | Plugins | Findings |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...model.tools.map(formatToolRow),
    "",
    "## Access Findings",
    ""
  ];

  if (model.findings.length === 0) {
    lines.push("No access findings.", "");
  } else {
    for (const finding of model.findings) {
      lines.push(
        `### ${escapeMarkdownHeading(finding.title)}`,
        "",
        `- Severity: ${finding.severity}`,
        `- Category: ${finding.category}`,
        `- Scope: ${finding.scope}`,
        `- Tools: ${finding.tools.join(", ")}`,
        `- Sources: ${finding.sources.length > 0 ? finding.sources.map(escapeInline).join(", ") : "none"}`,
        `- Message: ${finding.message}`,
        `- Recommendation: ${finding.recommendation}`,
        ""
      );
    }
  }

  lines.push("## Warnings", "");
  if (model.warningGroups.length === 0) {
    lines.push("No warnings.", "");
  } else {
    for (const group of model.warningGroups) {
      lines.push(`### ${group.reason} (${group.count})`, "");
      for (const warning of group.examples) {
        const prefix = warning.path ? `${escapeInline(warning.path)} - ` : "";
        lines.push(`- ${prefix}${warning.message}`);
      }
      if (group.omitted > 0) {
        lines.push(`- ${group.omitted} more omitted from this section.`);
      }
      lines.push("");
    }
  }

  lines.push("## Notes", "");
  for (const note of model.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function renderSanitizedReportJson(model: SanitizedReportModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

function buildSummary(
  result: MultiProjectScanResult,
  findings: readonly Finding[],
  warnings: readonly Warning[]
): SanitizedReportSummary {
  const allSkills = [
    ...result.userScope.tools.flatMap((tool) => tool.skills),
    ...result.projects.flatMap((project) =>
      project.scan.tools.flatMap((tool) => tool.skills)
    )
  ];
  const uniqueMcpServers = new Set(
    allSkills
      .filter((skill) => skill.kind === "mcp_server")
      .map((skill) => skill.name.toLowerCase())
  );
  const detectedTools = new Set<ToolId>();
  for (const tool of collectAllTools(result)) {
    if (tool.detected) detectedTools.add(tool.id);
  }

  return {
    detectedTools: detectedTools.size,
    projects: result.totals.projectCount,
    totalSkills: result.totals.userScopeSkills + result.totals.skillsAcrossProjects,
    totalMcpServers: allSkills.filter((skill) => skill.kind === "mcp_server").length,
    uniqueMcpServers: uniqueMcpServers.size,
    totalFindings: findings.length,
    warnings: warnings.length,
    bySeverity: countBySeverity(findings)
  };
}

function buildToolRows(
  result: MultiProjectScanResult,
  findings: readonly Finding[]
): SanitizedReportTool[] {
  const rows = new Map<ToolId, SanitizedReportTool>();
  for (const definition of TOOL_DEFINITIONS) {
    rows.set(definition.id, {
      id: definition.id,
      name: definition.name,
      detected: false,
      stats: createEmptyStats(),
      findings: 0
    });
  }

  for (const tool of collectAllTools(result)) {
    const row = rows.get(tool.id);
    if (!row) continue;
    row.detected = row.detected || tool.detected;
    row.stats = addStats(row.stats, tool.stats);
  }

  for (const finding of findings) {
    for (const toolId of finding.toolIds) {
      const row = rows.get(toolId);
      if (row) row.findings += 1;
    }
  }

  return [...rows.values()];
}

function sanitizeFinding(
  finding: Finding,
  redactor: PathRedactor,
  skillsById: ReadonlyMap<string, Skill>
): SanitizedReportFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    category: finding.category,
    title: redactor.redactText(finding.title),
    message:
      finding.category === "secret_reference"
        ? secretReferenceMessage(finding, skillsById)
        : redactor.redactText(finding.message),
    recommendation:
      finding.category === "secret_reference"
        ? "Confirm the referenced secrets live outside committed config and are scoped to the minimum permissions needed."
        : redactor.redactText(finding.recommendation),
    tools: [...finding.toolIds],
    scope: finding.scope,
    sources: finding.sourcePaths.map((source) => redactor.redactPath(source))
  };
}

function secretReferenceMessage(
  finding: Finding,
  skillsById: ReadonlyMap<string, Skill>
): string {
  const count = finding.relatedSkillIds.reduce((total, id) => {
    const skill = skillsById.get(id);
    const envKeys = readEnvKeys(skill?.details);
    return total + envKeys.filter((key) => SECRET_KEY_RE.test(key)).length;
  }, 0);

  if (count === 0) {
    return "The related MCP references secret-like environment variables. Variable names and values are omitted from this report.";
  }

  return `The related MCP references ${count} secret-like environment variable${count === 1 ? "" : "s"}. Variable names and values are omitted from this report.`;
}

function buildWarningGroups(
  warnings: readonly Warning[],
  redactor: PathRedactor,
  maxWarningsPerGroup: number
): SanitizedReportWarningGroup[] {
  const byReason = new Map<Warning["reason"], Warning[]>();
  for (const warning of warnings) {
    const list = byReason.get(warning.reason) ?? [];
    list.push(warning);
    byReason.set(warning.reason, list);
  }

  return [...byReason.entries()]
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    })
    .map(([reason, group]) => {
      const examples = group.slice(0, maxWarningsPerGroup).map((warning) => ({
        path: warning.path ? redactor.redactPath(warning.path) : undefined,
        message: redactor.redactText(warning.message)
      }));
      return {
        reason,
        count: group.length,
        examples,
        omitted: Math.max(0, group.length - examples.length)
      };
    });
}

interface PathRedactor {
  redactPath(pathLike: string): string;
  redactText(text: string): string;
}

function createPathRedactor(result: MultiProjectScanResult): PathRedactor {
  const prefixRules: Array<{ path: string; label: string }> = [];

  result.projects.forEach((project, index) => {
    prefixRules.push({ path: stripTrailingSlash(project.projectPath), label: `<PROJECT_${index + 1}>` });
  });
  result.devRoots.forEach((devRoot, index) => {
    prefixRules.push({ path: stripTrailingSlash(devRoot), label: `<DEV_ROOT_${index + 1}>` });
  });
  prefixRules.push({ path: stripTrailingSlash(result.homeDir), label: "<HOME>" });
  if (result.cwd && result.cwd !== result.homeDir) {
    prefixRules.push({ path: stripTrailingSlash(result.cwd), label: "<CWD>" });
  }

  prefixRules.sort((a, b) => b.path.length - a.path.length);

  const exactExternal = new Map<string, string>();

  function replaceKnownPaths(text: string): string {
    let output = text;
    for (const rule of prefixRules) {
      if (!rule.path) continue;
      output = output.replace(
        new RegExp(`${escapeRegExp(rule.path)}(?=$|[\\/\\s\`"',:;)\\]])`, "g"),
        rule.label
      );
    }
    return output;
  }

  function redactUnknownAbsolutePaths(text: string): string {
    return text.replace(/(^|[\s(["'`])\/[^\s`"',;)]+/g, (match, prefix: string) => {
      const pathPart = match.slice(prefix.length);
      if (pathPart.startsWith("/")) {
        const existing = exactExternal.get(pathPart);
        if (existing) return `${prefix}${existing}`;
        const label = `<PATH_${exactExternal.size + 1}>`;
        exactExternal.set(pathPart, label);
        return `${prefix}${label}`;
      }
      return match;
    });
  }

  function redactText(text: string): string {
    return redactUnknownAbsolutePaths(replaceKnownPaths(text));
  }

  return {
    redactPath: redactText,
    redactText
  };
}

function collectSkillsById(result: MultiProjectScanResult): Map<string, Skill> {
  const map = new Map<string, Skill>();
  for (const tool of collectAllTools(result)) {
    for (const skill of tool.skills) {
      map.set(skill.id, skill);
    }
  }
  return map;
}

function collectAllTools(result: MultiProjectScanResult): AITool[] {
  return [
    ...result.userScope.tools,
    ...result.projects.flatMap((project) => project.scan.tools)
  ];
}

function readEnvKeys(details: Skill["details"]): string[] {
  if (!details || typeof details !== "object") return [];
  const envKeys = (details).envKeys;
  if (!Array.isArray(envKeys)) return [];
  return envKeys.filter((key): key is string => typeof key === "string");
}

function countBySeverity(
  findings: readonly Finding[]
): Record<FindingSeverity, number> {
  return {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length
  };
}

function addStats(a: ToolStats, b: ToolStats): ToolStats {
  return {
    mcpServers: a.mcpServers + b.mcpServers,
    customCommands: a.customCommands + b.customCommands,
    customAgents: a.customAgents + b.customAgents,
    customPrompts: a.customPrompts + b.customPrompts,
    customTools: a.customTools + b.customTools,
    plugins: a.plugins + b.plugins,
    rules: a.rules + b.rules,
    memoryFiles: a.memoryFiles + b.memoryFiles,
    agentSkills: a.agentSkills + b.agentSkills,
    skillsShSkills: a.skillsShSkills + b.skillsShSkills,
    findings: a.findings + b.findings
  };
}

function compareReportFinding(
  a: SanitizedReportFinding,
  b: SanitizedReportFinding
): number {
  const severity = severityRank(a.severity) - severityRank(b.severity);
  if (severity !== 0) return severity;
  const category = a.category.localeCompare(b.category);
  if (category !== 0) return category;
  return a.title.localeCompare(b.title);
}

function severityRank(severity: FindingSeverity): number {
  switch (severity) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

function formatSeverityCounts(
  counts: Record<FindingSeverity, number>
): string {
  return `${counts.high} high, ${counts.medium} medium, ${counts.low} low`;
}

function formatToolRow(tool: SanitizedReportTool): string {
  const skills =
    tool.stats.agentSkills +
    tool.stats.skillsShSkills +
    tool.stats.customAgents +
    tool.stats.customCommands +
    tool.stats.customPrompts +
    tool.stats.rules +
    tool.stats.memoryFiles;
  return [
    "|",
    escapeTableCell(tool.name),
    "|",
    tool.detected ? "detected" : "not detected",
    "|",
    String(skills),
    "|",
    String(tool.stats.mcpServers),
    "|",
    String(tool.stats.customCommands + tool.stats.customPrompts + tool.stats.customAgents),
    "|",
    String(tool.stats.customTools),
    "|",
    String(tool.stats.plugins),
    "|",
    String(tool.findings),
    "|"
  ].join(" ");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeInline(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function escapeMarkdownHeading(value: string): string {
  return value.replace(/^#+\s*/g, "").replace(/\n/g, " ");
}

function formatIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
