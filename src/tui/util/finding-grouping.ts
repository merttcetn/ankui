import type { Finding, MultiProjectScanResult } from "../../types.js";

export type FindingCategory = Finding["category"];

export interface FindingCategorySpec {
  category: FindingCategory;
  label: string;
}

/**
 * Priority order for cross-tool access findings — matches
 * `src/utils/format-access.ts`'s `CATEGORY_ORDER`. Categories not present
 * here (`skipped_sensitive_file`, `parse_issue`) are surfaced in Doctor,
 * not Access.
 */
export const FINDING_CATEGORY_ORDER: ReadonlyArray<FindingCategorySpec> = [
  { category: "broad_access_capability", label: "Broad-access MCP servers" },
  { category: "duplicate_mcp", label: "Duplicate MCP servers" },
  { category: "secret_reference", label: "Secret-bearing env keys" },
  { category: "unknown_capability", label: "Uncatalogued MCP servers" },
  { category: "dangerous_pattern", label: "Review-worthy command patterns" }
];

export interface FindingSection {
  category: FindingCategory;
  label: string;
  findings: ReadonlyArray<Finding>;
}

/**
 * Aggregates findings from user-scope + every project. Groups by category
 * in priority order. Returns only sections that have at least one finding.
 * Within a section, findings are sorted by title (case-insensitive).
 */
export function aggregateFindings(
  result: MultiProjectScanResult
): FindingSection[] {
  const all: Finding[] = [];
  all.push(...result.userScope.findings);
  for (const project of result.projects) {
    all.push(...project.scan.findings);
  }
  if (all.length === 0) return [];

  const grouped = new Map<FindingCategory, Finding[]>();
  for (const finding of all) {
    const list = grouped.get(finding.category) ?? [];
    list.push(finding);
    grouped.set(finding.category, list);
  }

  const sections: FindingSection[] = [];
  for (const spec of FINDING_CATEGORY_ORDER) {
    const list = grouped.get(spec.category);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
    sections.push({ category: spec.category, label: spec.label, findings: sorted });
  }
  return sections;
}
