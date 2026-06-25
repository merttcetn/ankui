import type { AITool, ScanResult } from "../types.js";
import {
  metricRow,
  sectionTitle,
  sectionUnderline,
  statusIcon,
  style,
  tableHeader,
  tableRow,
  type FormatOptions
} from "./format-ui.js";

const TOOL_TABLE_WIDTHS = [2, 12, 72] as const;

export function formatScanSummary(result: ScanResult, options: FormatOptions = {}): string {
  const lines = [
    sectionTitle("Ankui Scan", options),
    sectionUnderline("Ankui Scan", options),
    metricRow("Status", style("complete", options, "green"), options),
    metricRow("Detected", plural(result.summary.detectedTools, "tool"), options),
    metricRow("MCP servers", `${result.summary.totalMcpServers} configured · ${result.summary.uniqueMcpServers} unique`, options),
    metricRow("Agent skills", String(result.summary.agentSkills + result.summary.skillsShSkills), options),
    metricRow("Actions", String(countCommandLikeItems(result.tools)), options),
    metricRow("Memory files", String(result.summary.memoryFiles), options),
    metricRow("Findings", colorCount(result.summary.totalFindings, "findings", options), options),
    metricRow("Warnings", colorCount(result.warnings.length, "warnings", options), options),
    "",
    sectionTitle("Tools", options),
    sectionUnderline("Tools", options),
    tableHeader(["", "Tool", "Details"], TOOL_TABLE_WIDTHS, options),
    ...result.tools.map((tool) => formatToolSummary(tool, options))
  ];

  return lines.join("\n");
}

export function formatJson(result: ScanResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatToolSummary(tool: AITool, options: FormatOptions): string {
  const status = tool.detected ? statusIcon("ok", options) : statusIcon("muted", options);
  const name = tool.detected ? tool.name : style(tool.name, options, "dim");
  const details = [
    countLabel(tool.stats.mcpServers, "MCP"),
    countLabel(tool.stats.agentSkills, "agent skills"),
    countLabel(tool.stats.skillsShSkills, "skills.sh skills"),
    countLabel(tool.stats.customCommands, "commands"),
    countLabel(tool.stats.customPrompts, "prompts"),
    countLabel(tool.stats.customAgents, "agents"),
    countLabel(tool.stats.rules, "rules"),
    countLabel(tool.stats.customTools, "tools"),
    countLabel(tool.stats.plugins, "plugins"),
    countLabel(tool.stats.memoryFiles, "memory files"),
    countLabel(tool.stats.findings, "findings")
  ].filter(Boolean);

  const detailText = details.length > 0 ? details.join(" · ") : tool.detected ? "detected" : style("not detected", options, "dim");
  return tableRow([status, name, detailText], TOOL_TABLE_WIDTHS);
}

function countCommandLikeItems(tools: AITool[]): number {
  return tools.reduce(
    (total, tool) =>
      total +
      tool.stats.customCommands +
      tool.stats.customPrompts +
      tool.stats.customAgents +
      tool.stats.rules +
      tool.stats.customTools +
      tool.stats.plugins,
    0
  );
}

function countLabel(count: number, label: string): string | undefined {
  if (count === 0) {
    return undefined;
  }

  return `${count} ${label}`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function colorCount(count: number, kind: "findings" | "warnings", options: FormatOptions): string {
  if (count === 0) return style(String(count), options, "green");
  return style(String(count), options, kind === "findings" ? "red" : "yellow");
}
