import type { FindingSeverity } from "../types.js";
import type {
  DiffFieldChange,
  DiffItemKind,
  DiffTarget,
  SnapshotDiffChange,
  SnapshotDiffResult,
  SnapshotDocument,
  SnapshotEntity,
  SnapshotFinding,
  SnapshotToolState,
  SnapshotValue,
  SnapshotWarning
} from "./types.js";

export function diffSnapshots(
  from: SnapshotDocument,
  to: SnapshotDocument,
  options: { toCurrent?: boolean } = {}
): SnapshotDiffResult {
  const unreliableContexts = new Set([
    ...from.warnings.filter(isIncompleteScanWarning).map((warning) => warning.context),
    ...to.warnings.filter(isIncompleteScanWarning).map((warning) => warning.context)
  ]);
  const reliable = <T extends { context: string }>(values: readonly T[]): T[] =>
    values.filter((value) => !unreliableContexts.has(value.context));
  const inventoryChanges = [
    ...diffCollection(reliable(from.tools), reliable(to.tools), "tool", toolLabel, ["detected"]),
    ...diffCollection(
      reliable(from.entities).map(normalizeLegacyEntityIdentity),
      reliable(to.entities).map(normalizeLegacyEntityIdentity),
      "entity",
      entityLabel,
      [
      "summary",
      "scope",
      "source",
      "sourcePath",
      "capabilityCategories",
      "accessLevel",
      "attributes"
      ]
    ),
    ...diffCollection(
      reliable(from.findings).map(normalizeLegacyFindingIdentity),
      reliable(to.findings).map(normalizeLegacyFindingIdentity),
      "finding",
      findingLabel,
      [
      "severity",
      "accessLevel",
      "scope",
      "toolIds",
      "relatedEntityKeys"
      ]
    )
  ];
  const healthChanges = diffCollection(from.warnings, to.warnings, "warning", warningLabel, []);
  const changes = [...inventoryChanges, ...healthChanges].sort(compareChange);

  return {
    version: 1,
    from: targetFor(from, false),
    to: targetFor(to, Boolean(options.toCurrent)),
    summary: {
      total: inventoryChanges.length,
      added: inventoryChanges.filter((change) => change.type === "added").length,
      removed: inventoryChanges.filter((change) => change.type === "removed").length,
      modified: inventoryChanges.filter((change) => change.type === "modified").length,
      findingsBefore: countSeverity(from.findings),
      findingsAfter: countSeverity(to.findings),
      scanHealth: {
        total: healthChanges.length,
        added: healthChanges.filter((change) => change.type === "added").length,
        removed: healthChanges.filter((change) => change.type === "removed").length
      }
    },
    changes
  };
}

function normalizeLegacyEntityIdentity(entity: SnapshotEntity): SnapshotEntity {
  const key = entity.key.replace(/\/\.disabled\//g, "/");
  return key === entity.key ? entity : { ...entity, key };
}

function normalizeLegacyFindingIdentity(finding: SnapshotFinding): SnapshotFinding {
  const key = finding.key.replace(/\/\.disabled\//g, "/");
  const relatedEntityKeys = finding.relatedEntityKeys.map((entityKey) =>
    entityKey.replace(/\/\.disabled\//g, "/")
  );
  if (key === finding.key && relatedEntityKeys.every((value, index) => value === finding.relatedEntityKeys[index])) {
    return finding;
  }
  return { ...finding, key, relatedEntityKeys };
}

function isIncompleteScanWarning(warning: SnapshotWarning): boolean {
  return warning.reason === "adapter_timeout";
}

function diffCollection<T extends { key: string; context: string }>(
  before: readonly T[],
  after: readonly T[],
  kind: DiffItemKind,
  label: (value: T) => string,
  comparableFields: readonly string[]
): SnapshotDiffChange[] {
  const beforeMap = new Map(before.map((value) => [value.key, value]));
  const afterMap = new Map(after.map((value) => [value.key, value]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  const changes: SnapshotDiffChange[] = [];

  for (const key of keys) {
    const oldValue = beforeMap.get(key);
    const newValue = afterMap.get(key);
    if (!oldValue && newValue) {
      changes.push(baseChange("added", kind, newValue, label(newValue)));
      continue;
    }
    if (oldValue && !newValue) {
      changes.push(baseChange("removed", kind, oldValue, label(oldValue)));
      continue;
    }
    if (!oldValue || !newValue) continue;
    const fields = compareFields(oldValue, newValue, comparableFields);
    if (fields.length > 0) {
      changes.push({
        ...baseChange("modified", kind, newValue, label(newValue)),
        fields
      });
    }
  }
  return changes;
}

function baseChange<T extends { key: string; context: string }>(
  type: SnapshotDiffChange["type"],
  kind: DiffItemKind,
  value: T,
  label: string
): SnapshotDiffChange {
  const record = value as Record<string, unknown>;
  return {
    type,
    kind,
    key: value.key,
    context: value.context,
    label,
    ...(typeof record.toolId === "string" ? { toolId: record.toolId as SnapshotDiffChange["toolId"] } : {}),
    ...(typeof record.severity === "string" ? { severity: record.severity as FindingSeverity } : {}),
    fields: []
  };
}

function compareFields<T extends object>(
  before: T,
  after: T,
  fields: readonly string[]
): DiffFieldChange[] {
  const oldRecord = before as Record<string, unknown>;
  const newRecord = after as Record<string, unknown>;
  const changes: DiffFieldChange[] = [];
  for (const field of fields) {
    if (field === "attributes" && isRecord(oldRecord[field]) && isRecord(newRecord[field])) {
      const attributeKeys = [...new Set([
        ...Object.keys(oldRecord[field]),
        ...Object.keys(newRecord[field])
      ])].sort();
      for (const key of attributeKeys) {
        const beforeAttribute = oldRecord[field][key];
        const afterAttribute = newRecord[field][key];
        if (stableJson(beforeAttribute) === stableJson(afterAttribute)) continue;
        const oldValue = normalizeDiffValue(beforeAttribute);
        const newValue = normalizeDiffValue(afterAttribute);
        changes.push({
          field: `attributes.${key}`,
          ...(oldValue !== undefined ? { before: oldValue } : {}),
          ...(newValue !== undefined ? { after: newValue } : {})
        });
      }
      continue;
    }
    if (stableJson(oldRecord[field]) === stableJson(newRecord[field])) continue;
    const oldValue = normalizeDiffValue(oldRecord[field]);
    const newValue = normalizeDiffValue(newRecord[field]);
    changes.push({
      field,
      ...(oldValue !== undefined ? { before: oldValue } : {}),
      ...(newValue !== undefined ? { after: newValue } : {})
    });
  }
  return changes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeDiffValue(value: unknown): SnapshotValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDiffValue).filter((entry): entry is SnapshotValue => entry !== undefined);
  }
  if (typeof value === "object") return stableJson(value);
  return String(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function targetFor(document: SnapshotDocument, current: boolean): DiffTarget {
  if (current) return { kind: "current", createdAt: document.createdAt };
  return {
    kind: "snapshot",
    id: document.id,
    createdAt: document.createdAt,
    ...(document.label ? { label: document.label } : {})
  };
}

function countSeverity(findings: readonly SnapshotFinding[]): Record<FindingSeverity, number> {
  return {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length
  };
}

function toolLabel(value: SnapshotToolState): string {
  return `${value.toolId} detection`;
}

function entityLabel(value: SnapshotEntity): string {
  return value.name;
}

function findingLabel(value: SnapshotFinding): string {
  return value.title;
}

function warningLabel(value: SnapshotWarning): string {
  return value.path ? `${value.reason}: ${value.path}` : value.message;
}

function compareChange(a: SnapshotDiffChange, b: SnapshotDiffChange): number {
  const typeOrder = { added: 0, modified: 1, removed: 2 } as const;
  return typeOrder[a.type] - typeOrder[b.type] || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);
}
