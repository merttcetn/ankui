import type { Finding, ScanResult } from "../types.js";
import {
  ACCESS_FINDING_CATEGORY_SPECS,
  ALL_ACCESS_FINDING_CATEGORIES,
  ALL_FINDING_SEVERITIES,
  compareFindingsForAccess,
  severityLabel
} from "./finding-order.js";
import {
  metricRow,
  sectionTitle,
  sectionUnderline,
  statusIcon,
  style,
  type FormatOptions
} from "./format-ui.js";
import { relativizeHome } from "./paths.js";

type Category = Finding["category"];
type CategorySpec = (typeof ACCESS_FINDING_CATEGORY_SPECS)[number];

export function formatAccessReview(result: ScanResult, options: FormatOptions = {}): string {
  if (result.findings.length === 0) {
    return [
      sectionTitle("Ankui Access Review", options),
      sectionUnderline("Ankui Access Review", options),
      `${statusIcon("ok", options)} No findings.`
    ].join("\n");
  }

  const grouped = groupByCategory(result.findings);
  const header = formatHeader(result.findings, options);
  const sections: string[] = [];

  for (const spec of ACCESS_FINDING_CATEGORY_SPECS) {
    const findings = grouped.get(spec.category) ?? [];
    if (findings.length === 0) continue;

    sections.push(formatSection(spec, findings, result.homeDir, options));
  }

  return [header, "", ...sections].join("\n");
}

function formatHeader(findings: readonly Finding[], options: FormatOptions): string {
  const counts = countByCategory(findings);
  const severity = countBySeverity(findings)
    .map(([level, count]) => `${count} ${level}`)
    .join(" · ");
  const parts: string[] = [];
  for (const [category, count] of counts) {
    parts.push(`${count} ${category}`);
  }
  const tail = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
  return [
    sectionTitle("Ankui Access Review", options),
    sectionUnderline("Ankui Access Review", options),
    metricRow("Findings", style(String(findings.length), options, "red"), options),
    metricRow("Severity", severity || "none", options),
    metricRow("Mix", tail.length > 0 ? tail.slice(2, -1) : "none", options)
  ].join("\n");
}

function formatSection(
  spec: CategorySpec,
  findings: readonly Finding[],
  homeDir: string,
  options: FormatOptions
): string {
  const heading = `${spec.label} (${findings.length})`;
  const bullets = [...findings]
    .sort(compareFindingsForAccess)
    .map((finding) => formatFinding(finding, homeDir, options));
  return [sectionTitle(heading, options), sectionUnderline(heading, options), ...bullets].join("\n");
}

function formatFinding(finding: Finding, homeDir: string, options: FormatOptions): string {
  const sourcesLabel = finding.sourcePaths.length === 1 ? "Source" : "Sources";
  const sources = finding.sourcePaths.map((p) => `    ${style(relativizeHome(p, homeDir), options, "dim")}`);
  const status = statusForSeverity(finding.severity);
  const titleStyle = styleForSeverity(finding.severity);
  const lines = [
    `${statusIcon(status, options)} ${style(`[${severityLabel(finding.severity)}] ${finding.title}`, options, titleStyle)}`,
    `  ${style("Scope", options, "dim")}          ${finding.scope}`,
    `  ${style("Tools", options, "dim")}          ${finding.toolIds.join(", ")}`,
    `  ${style(sourcesLabel, options, "dim")}:`,
    ...sources,
    `  ${style("Recommendation", options, "dim")} ${finding.recommendation}`,
    ""
  ];
  return lines.join("\n");
}

function statusForSeverity(
  severity: Finding["severity"]
): "danger" | "warn" | "muted" {
  switch (severity) {
    case "high":
      return "danger";
    case "medium":
      return "warn";
    case "low":
      return "muted";
  }
}

function styleForSeverity(
  severity: Finding["severity"]
): "red" | "yellow" | "cyan" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "yellow";
    case "low":
      return "cyan";
  }
}

function groupByCategory(findings: readonly Finding[]): Map<Category, Finding[]> {
  const map = new Map<Category, Finding[]>();
  for (const finding of findings) {
    const list = map.get(finding.category) ?? [];
    list.push(finding);
    map.set(finding.category, list);
  }
  return map;
}

function countByCategory(findings: readonly Finding[]): Array<[Category, number]> {
  const grouped = groupByCategory(findings);
  const entries: Array<[Category, number]> = [];
  for (const [category, list] of grouped) {
    entries.push([category, list.length]);
  }
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries;
}

const ALL_SCOPES: ReadonlyArray<Finding["scope"]> = ["user", "project", "cross_tool"];

function countBySeverity(
  findings: readonly Finding[]
): Array<[Finding["severity"], number]> {
  const counts = new Map<Finding["severity"], number>();
  for (const severity of ALL_FINDING_SEVERITIES) {
    counts.set(severity, 0);
  }
  for (const finding of findings) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  return ALL_FINDING_SEVERITIES
    .map((severity) => [severity, counts.get(severity) ?? 0] as [Finding["severity"], number])
    .filter(([, count]) => count > 0);
}

export function formatAccessReviewJson(result: ScanResult): string {
  const byCategory: Record<Category, number> = Object.fromEntries(
    ALL_ACCESS_FINDING_CATEGORIES.map((c) => [c, 0])
  ) as Record<Category, number>;
  const byScope: Record<Finding["scope"], number> = Object.fromEntries(
    ALL_SCOPES.map((s) => [s, 0])
  ) as Record<Finding["scope"], number>;
  const bySeverity: Record<Finding["severity"], number> = Object.fromEntries(
    ALL_FINDING_SEVERITIES.map((s) => [s, 0])
  ) as Record<Finding["severity"], number>;

  for (const finding of result.findings) {
    byCategory[finding.category] += 1;
    byScope[finding.scope] += 1;
    bySeverity[finding.severity] += 1;
  }

  const payload = {
    scannedAt: result.scannedAt,
    cwd: result.cwd,
    homeDir: result.homeDir,
    findings: result.findings,
    summary: {
      totalFindings: result.findings.length,
      bySeverity,
      byCategory,
      byScope
    }
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
