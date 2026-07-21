import type {
  Finding,
  FindingCategory,
  FindingScope,
  MultiProjectScanResult,
  ToolId
} from "../../types.js";
import {
  FINDING_CATEGORY_ORDER
} from "../../tui/util/finding-grouping.js";
import { compareFindingsForAccess } from "../../utils/finding-order.js";

export interface FindingOccurrence {
  finding: Finding;
  context: string;
}

export interface FindingPresentationGroup {
  key: string;
  category: FindingCategory;
  categoryLabel: string;
  severity: Finding["severity"];
  title: string;
  message: string;
  recommendation: string;
  occurrences: FindingOccurrence[];
  toolIds: ToolId[];
  scopes: FindingScope[];
  sourcePaths: string[];
}

export interface FindingPresentationSection {
  category: FindingCategory;
  label: string;
  groups: FindingPresentationGroup[];
  occurrenceCount: number;
}

interface LocatedFinding {
  finding: Finding;
  context: string;
}

export function buildFindingPresentation(
  scan: MultiProjectScanResult
): FindingPresentationSection[] {
  const located: LocatedFinding[] = scan.userScope.findings.map((finding) => ({
    finding,
    context: "User scope"
  }));

  for (const project of scan.projects) {
    located.push(...project.scan.findings.map((finding) => ({
      finding,
      context: project.displayPath
    })));
  }

  const byCategory = new Map<FindingCategory, Map<string, LocatedFinding[]>>();
  for (const item of located) {
    const category = byCategory.get(item.finding.category) ?? new Map<string, LocatedFinding[]>();
    const key = findingFingerprint(item.finding);
    const occurrences = category.get(key) ?? [];
    occurrences.push(item);
    category.set(key, occurrences);
    byCategory.set(item.finding.category, category);
  }

  return FINDING_CATEGORY_ORDER.flatMap((spec) => {
    const category = byCategory.get(spec.category);
    if (!category) return [];

    const groups = [...category.entries()]
      .map(([key, occurrences]) => toPresentationGroup(key, spec.label, occurrences))
      .sort((a, b) => compareFindingsForAccess(a.occurrences[0].finding, b.occurrences[0].finding));

    return [{
      category: spec.category,
      label: spec.label,
      groups,
      occurrenceCount: groups.reduce((sum, group) => sum + group.occurrences.length, 0)
    }];
  });
}

export function findingPresentationTotals(
  sections: readonly FindingPresentationSection[]
): { unique: number; occurrences: number } {
  return sections.reduce(
    (totals, section) => ({
      unique: totals.unique + section.groups.length,
      occurrences: totals.occurrences + section.occurrenceCount
    }),
    { unique: 0, occurrences: 0 }
  );
}

export function findingFingerprint(finding: Finding): string {
  return JSON.stringify([
    finding.category,
    finding.severity,
    finding.title,
    finding.message,
    finding.recommendation
  ]);
}

function toPresentationGroup(
  key: string,
  categoryLabel: string,
  located: LocatedFinding[]
): FindingPresentationGroup {
  const first = located[0].finding;
  return {
    key,
    category: first.category,
    categoryLabel,
    severity: first.severity,
    title: first.title,
    message: first.message,
    recommendation: first.recommendation,
    occurrences: located.map(({ finding, context }) => ({ finding, context })),
    toolIds: unique(located.flatMap(({ finding }) => finding.toolIds)),
    scopes: unique(located.map(({ finding }) => finding.scope)),
    sourcePaths: unique(located.flatMap(({ finding }) => finding.sourcePaths))
  };
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
