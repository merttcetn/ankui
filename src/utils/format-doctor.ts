import type { AITool, ScanResult, Warning } from "../types.js";
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
import { relativizeHome } from "./paths.js";

const TOOL_TABLE_WIDTHS = [2, 13, 8, 72] as const;

export function formatDoctor(result: ScanResult, options: FormatOptions = {}): string {
  const header = formatHeader(result, options);
  const toolsSection = formatToolsSection(result.tools, result.cwd, result.homeDir, options);
  const warningsSection =
    result.warnings.length === 0
      ? [sectionTitle("Warnings", options), sectionUnderline("Warnings", options), `${statusIcon("ok", options)} No warnings.`].join("\n")
      : formatWarningsSection(result.warnings, result.homeDir, options);

  return [header, "", toolsSection, "", warningsSection].join("\n").replace(/\n+$/, "");
}

function formatHeader(result: ScanResult, options: FormatOptions): string {
  const detectedCount = result.tools.filter((t) => t.detected).length;
  return [
    sectionTitle("Ankui Doctor", options),
    sectionUnderline("Ankui Doctor", options),
    metricRow("Detected", plural(detectedCount, "tool"), options),
    metricRow("Warnings", result.warnings.length === 0 ? style("0", options, "green") : style(String(result.warnings.length), options, "yellow"), options)
  ].join("\n");
}

function formatToolsSection(tools: ReadonlyArray<AITool>, cwd: string, homeDir: string, options: FormatOptions): string {
  const rows = tools.flatMap((tool) => formatToolRows(tool, cwd, homeDir, options));
  return [
    sectionTitle("Tools", options),
    sectionUnderline("Tools", options),
    tableHeader(["", "Tool", "Scope", "Path"], TOOL_TABLE_WIDTHS, options),
    ...rows
  ].join("\n");
}

function formatToolRows(tool: AITool, cwd: string, homeDir: string, options: FormatOptions): string[] {
  if (!tool.detected) {
    return [
      tableRow([
        statusIcon("muted", options),
        style(tool.name, options, "dim"),
        "",
        style("not detected", options, "dim")
      ], TOOL_TABLE_WIDTHS)
    ];
  }

  const rows: string[] = [];
  let first = true;
  for (const path of tool.detectedPaths) {
    const classified = classifyAndRelativize(path, cwd, homeDir);
    rows.push(tableRow([
      first ? statusIcon("ok", options) : "",
      first ? tool.name : "",
      classified.scope,
      classified.display
    ], TOOL_TABLE_WIDTHS));
    first = false;
  }

  if (rows.length === 0) {
    rows.push(tableRow([statusIcon("ok", options), tool.name, "", "detected"], TOOL_TABLE_WIDTHS));
  }
  return rows;
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

function formatWarningsSection(warnings: ReadonlyArray<Warning>, homeDir: string, options: FormatOptions): string {
  const heading = `Warnings (${warnings.length})`;

  const grouped = groupWarningsByReason(warnings);
  const sorted = [...grouped.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const blocks: string[] = [];
  for (const [reason, group] of sorted) {
    const lines = [style(`${reason} (${group.length})`, options, "yellow")];
    for (const warning of group) {
      const rhs = warning.path ? relativizeHome(warning.path, homeDir) : warning.message;
      lines.push(`  ${statusIcon("warn", options)} ${rhs}`);
    }
    blocks.push(lines.join("\n"));
  }

  return [sectionTitle(heading, options), sectionUnderline(heading, options), blocks.join("\n\n")].join("\n");
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
