import type { AITool, ScanResult, Warning } from "../types.js";
import { relativizeHome } from "./paths.js";

const TOOL_NAME_COLUMN_WIDTH = 11;

export function formatDoctor(result: ScanResult): string {
  const header = formatHeader(result);
  const toolsSection = formatToolsSection(result.tools, result.cwd, result.homeDir);
  const warningsSection =
    result.warnings.length === 0
      ? "No warnings."
      : formatWarningsSection(result.warnings, result.homeDir);

  return [header, "", toolsSection, "", warningsSection].join("\n").replace(/\n+$/, "");
}

function formatHeader(result: ScanResult): string {
  const detectedCount = result.tools.filter((t) => t.detected).length;
  return (
    `Ankui doctor — ${plural(detectedCount, "detected tool")}, ` +
    `${plural(result.warnings.length, "warning")}`
  );
}

function formatToolsSection(tools: ReadonlyArray<AITool>, cwd: string, homeDir: string): string {
  const rows = tools.map((tool) => formatToolRow(tool, cwd, homeDir));
  return ["Tools", "─────", ...rows].join("\n");
}

function formatToolRow(tool: AITool, cwd: string, homeDir: string): string {
  if (!tool.detected) {
    const name = tool.name.padEnd(TOOL_NAME_COLUMN_WIDTH);
    return `- ${name}not detected`;
  }

  const userPaths: string[] = [];
  const projectPaths: string[] = [];
  for (const path of tool.detectedPaths) {
    const classified = classifyAndRelativize(path, cwd, homeDir);
    (classified.scope === "project" ? projectPaths : userPaths).push(classified.display);
  }

  const lines: string[] = [`✓ ${tool.name}`];
  if (userPaths.length > 0) {
    lines.push("    user:");
    for (const p of userPaths) lines.push(`      ${p}`);
  }
  if (projectPaths.length > 0) {
    lines.push("    project:");
    for (const p of projectPaths) lines.push(`      ${p}`);
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

function formatWarningsSection(warnings: ReadonlyArray<Warning>, homeDir: string): string {
  const heading = `Warnings (${warnings.length})`;
  const underline = "─".repeat(heading.length);

  const grouped = groupWarningsByReason(warnings);
  const sorted = [...grouped.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const blocks: string[] = [];
  for (const [reason, group] of sorted) {
    const lines = [`${reason} (${group.length})`];
    for (const warning of group) {
      const rhs = warning.path ? relativizeHome(warning.path, homeDir) : warning.message;
      lines.push(`  ${rhs}`);
    }
    blocks.push(lines.join("\n"));
  }

  return [heading, underline, blocks.join("\n\n")].join("\n");
}

function groupWarningsByReason(warnings: ReadonlyArray<Warning>): Map<string, Warning[]> {
  const map = new Map<string, Warning[]>();
  for (const warning of warnings) {
    const list = map.get(warning.reason) ?? [];
    list.push(warning);
    map.set(warning.reason, list);
  }
  return map;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function formatDoctorJson(result: ScanResult): string {
  const warningsByReason: Record<string, number> = {};
  for (const warning of result.warnings) {
    warningsByReason[warning.reason] = (warningsByReason[warning.reason] ?? 0) + 1;
  }

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    detectedToolCount: result.tools.filter((t) => t.detected).length,
    tools: result.tools.map((t) => ({
      id: t.id,
      name: t.name,
      detected: t.detected,
      detectedPaths: t.detectedPaths
    })),
    warningCount: result.warnings.length,
    warningsByReason,
    warnings: result.warnings
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
