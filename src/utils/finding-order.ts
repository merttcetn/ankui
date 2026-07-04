import {
  compareFindingSeverity,
  defaultFindingSeverity,
  FINDING_SEVERITY_ORDER,
  type Finding,
  type FindingCategory,
  type FindingSeverity
} from "../types.js";

export interface FindingCategorySpec {
  category: FindingCategory;
  label: string;
}

const ACCESS_FINDING_CATEGORY_ORDER: ReadonlyArray<FindingCategorySpec> = [
  { category: "broad_access_capability", label: "Broad-access MCP servers" },
  { category: "duplicate_mcp", label: "Duplicate MCP servers" },
  { category: "secret_reference", label: "Secret-bearing env keys" },
  { category: "unknown_capability", label: "Uncatalogued MCP servers" },
  { category: "dangerous_pattern", label: "Review-worthy command patterns" }
];

const CATEGORY_PRIORITY = new Map(
  ACCESS_FINDING_CATEGORY_ORDER.map((spec, index) => [spec.category, index])
);

export const ACCESS_FINDING_CATEGORY_SPECS: ReadonlyArray<FindingCategorySpec> =
  [...ACCESS_FINDING_CATEGORY_ORDER].sort((a, b) =>
    compareFindingCategoriesForAccess(a.category, b.category)
  );

export const ALL_ACCESS_FINDING_CATEGORIES: ReadonlyArray<FindingCategory> =
  ACCESS_FINDING_CATEGORY_ORDER.map((spec) => spec.category);

export const ALL_FINDING_SEVERITIES: ReadonlyArray<FindingSeverity> =
  FINDING_SEVERITY_ORDER;

export function compareFindingCategoriesForAccess(
  a: FindingCategory,
  b: FindingCategory
): number {
  const severity = severityRank(defaultFindingSeverity(a)) - severityRank(defaultFindingSeverity(b));
  if (severity !== 0) return severity;
  return categoryRank(a) - categoryRank(b);
}

export function compareFindingsForAccess(a: Finding, b: Finding): number {
  const severity = compareFindingSeverity(a, b);
  if (severity !== 0) return severity;

  const category = compareFindingCategoriesForAccess(a.category, b.category);
  if (category !== 0) return category;

  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function severityLabel(severity: FindingSeverity): string {
  return severity.toUpperCase();
}

function categoryRank(category: FindingCategory): number {
  return CATEGORY_PRIORITY.get(category) ?? ACCESS_FINDING_CATEGORY_ORDER.length;
}

function severityRank(severity: FindingSeverity): number {
  const index = FINDING_SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? FINDING_SEVERITY_ORDER.length : index;
}
