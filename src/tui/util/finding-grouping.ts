import type { Finding, MultiProjectScanResult } from "../../types.js";
import {
  ACCESS_FINDING_CATEGORY_SPECS,
  compareFindingsForAccess,
  type FindingCategorySpec
} from "../../utils/finding-order.js";

export type FindingCategory = Finding["category"];

/**
 * Priority order for cross-tool access findings. Categories not present here
 * (`skipped_sensitive_file`, `parse_issue`) are surfaced in Doctor, not Access.
 */
export const FINDING_CATEGORY_ORDER: ReadonlyArray<FindingCategorySpec> =
  ACCESS_FINDING_CATEGORY_SPECS;

export interface FindingSection {
  category: FindingCategory;
  label: string;
  findings: ReadonlyArray<Finding>;
}

/**
 * Aggregates findings from user-scope + every project. Groups by category in
 * severity-first priority order. Returns only sections that have at least one
 * finding. Within a section, findings are sorted by severity, then title.
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
    const sorted = [...list].sort(compareFindingsForAccess);
    sections.push({ category: spec.category, label: spec.label, findings: sorted });
  }
  return sections;
}
