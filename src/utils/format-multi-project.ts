import type { AITool, MultiProjectScanResult, Warning } from "../types.js";
import { relativizeHome } from "./paths.js";

const TOOL_NAME_COLUMN_WIDTH = 10;
const PROJECT_DISPLAY_COLUMN_WIDTH = 48;

export function formatMultiProjectSummary(result: MultiProjectScanResult): string {
  const header = formatHeader(result);

  if (result.devRoots.length === 0) {
    return [
      header,
      "",
      "No dev roots registered. Run `ankui tui` to register dev roots (Phase 8a).",
      "",
      result.warnings.length === 0
        ? "No warnings."
        : formatWarningsSection(result.warnings, result.homeDir)
    ]
      .join("\n")
      .replace(/\n+$/, "");
  }

  const userScopeBlock = formatUserScopeBlock(result.userScope.tools);
  const projectsBlock = formatProjectsBlock(result);
  const warningsBlock =
    result.warnings.length === 0
      ? "No warnings."
      : formatWarningsSection(result.warnings, result.homeDir);

  return [header, "", userScopeBlock, "", projectsBlock, "", warningsBlock]
    .join("\n")
    .replace(/\n+$/, "");
}

export function formatMultiProjectJson(result: MultiProjectScanResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatHeader(result: MultiProjectScanResult): string {
  return (
    `Ankui multi-project scan — ` +
    `${plural(result.totals.projectCount, "project")} across ` +
    `${plural(result.devRoots.length, "dev root")}, ` +
    `${plural(result.totals.userScopeSkills, "user-scope skill")}`
  );
}

function formatUserScopeBlock(tools: ReadonlyArray<AITool>): string {
  const rows = tools.map((tool) => formatUserScopeRow(tool));
  return ["User scope", "──────────", ...rows].join("\n");
}

function formatUserScopeRow(tool: AITool): string {
  const icon = tool.detected ? "✓" : "-";
  const name = tool.name.padEnd(TOOL_NAME_COLUMN_WIDTH);
  const rhs = tool.detected ? `${tool.skills.length} skills` : "not detected";
  return `${icon} ${name}${rhs}`;
}

function formatProjectsBlock(result: MultiProjectScanResult): string {
  if (result.projects.length === 0) {
    const heading = `Projects (0)`;
    return [
      heading,
      "─".repeat(heading.length),
      "No projects found in any registered dev root."
    ].join("\n");
  }

  const heading = `Projects (${result.projects.length})`;
  const underline = "─".repeat(heading.length);
  const sorted = [...result.projects].sort((a, b) =>
    a.displayPath.localeCompare(b.displayPath)
  );
  const rows = sorted.map(formatProjectRow);

  return [heading, underline, ...rows].join("\n");
}

function formatProjectRow(project: MultiProjectScanResult["projects"][number]): string {
  const skills = project.scan.tools.reduce((n, t) => n + t.skills.length, 0);
  const findings = project.scan.findings.length;
  const left = project.displayPath.padEnd(PROJECT_DISPLAY_COLUMN_WIDTH);
  return `${left} ${skills} skills · ${findings} findings`;
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
