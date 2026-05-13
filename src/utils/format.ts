import type { AITool, ScanResult } from "../types.js";

export function formatScanSummary(result: ScanResult): string {
  const lines = [
    "Ankui scan complete",
    "",
    `Detected tools: ${result.summary.detectedTools}`,
    `MCP servers: ${result.summary.totalMcpServers} configured, ${result.summary.uniqueMcpServers} unique`,
    `Commands/prompts/agents/rules/tools: ${countCommandLikeItems(result.tools)}`,
    `Memory files: ${result.summary.memoryFiles}`,
    `Access findings: ${result.summary.totalFindings}`,
    `Warnings: ${result.warnings.length}`,
    "",
    "Tools:",
    ...result.tools.map(formatToolSummary)
  ];

  return lines.join("\n");
}

export function formatJson(result: ScanResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatToolSummary(tool: AITool): string {
  const status = tool.detected ? "✓" : "-";
  const details = [
    countLabel(tool.stats.mcpServers, "MCP"),
    countLabel(tool.stats.customCommands, "commands"),
    countLabel(tool.stats.customPrompts, "prompts"),
    countLabel(tool.stats.customAgents, "agents"),
    countLabel(tool.stats.rules, "rules"),
    countLabel(tool.stats.customTools, "tools"),
    countLabel(tool.stats.plugins, "plugins"),
    countLabel(tool.stats.memoryFiles, "memory files"),
    countLabel(tool.stats.findings, "findings")
  ].filter(Boolean);

  return `${status} ${tool.name.padEnd(9)} ${
    details.length > 0 ? details.join(" · ") : tool.detected ? "detected" : "not detected"
  }`;
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
