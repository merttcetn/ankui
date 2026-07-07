import type {
  SnapshotDiffResult,
  SnapshotListResult,
  SnapshotMetadata,
  SnapshotValue
} from "../snapshots/types.js";

export function formatSnapshotCreated(
  snapshot: SnapshotMetadata,
  pruned: readonly string[]
): string {
  const lines = [
    "Ankui Snapshot",
    "──────────────",
    `Created   ${snapshot.id}`,
    `Time      ${snapshot.createdAt}`,
    ...(snapshot.label ? [`Label     ${snapshot.label}`] : []),
    `Inventory ${snapshot.entities} entities · ${snapshot.findings} findings · ${snapshot.projects} projects`
  ];
  if (pruned.length > 0) lines.push(`Retention pruned ${pruned.length} old snapshot(s)`);
  return lines.join("\n");
}

export function formatSnapshotList(result: SnapshotListResult): string {
  if (result.snapshots.length === 0) {
    return "No snapshots found. Run `ankui snapshot` to create a baseline.";
  }
  const lines = ["Ankui Snapshots", "───────────────"];
  for (const snapshot of result.snapshots) {
    const label = snapshot.label ? ` · ${snapshot.label}` : "";
    lines.push(`${snapshot.id}  ${snapshot.createdAt}${label}`);
    lines.push(`  ${snapshot.entities} entities · ${snapshot.findings} findings · ${snapshot.projects} projects`);
  }
  if (result.warnings.length > 0) {
    lines.push("", `Warnings (${result.warnings.length})`);
    for (const warning of result.warnings) lines.push(`  ! ${warning.path}: ${warning.message}`);
  }
  return lines.join("\n");
}

export function formatSnapshotDeleted(snapshot: SnapshotMetadata): string {
  return `Deleted snapshot ${snapshot.id}${snapshot.label ? ` (${snapshot.label})` : ""}.`;
}

export function formatSnapshotDiff(diff: SnapshotDiffResult): string {
  const from = formatTarget(diff.from);
  const to = formatTarget(diff.to);
  const lines = [
    "Ankui Changes",
    "─────────────",
    `From      ${from}`,
    `To        ${to}`,
    `Changes   ${diff.summary.added} added · ${diff.summary.modified} modified · ${diff.summary.removed} removed`
  ];
  if (diff.changes.length === 0) {
    lines.push("", "No semantic changes since the selected snapshot.");
    return lines.join("\n");
  }
  const symbols = { added: "+", modified: "~", removed: "-" } as const;
  for (const change of diff.changes.filter((entry) => entry.kind !== "warning")) {
    lines.push("", `${symbols[change.type]} [${change.kind}] ${change.label}`);
    lines.push(`  ${change.context}`);
    for (const field of change.fields) {
      lines.push(`  ${field.field}: ${formatValue(field.before)} → ${formatValue(field.after)}`);
    }
  }
  if (diff.summary.total === 0) {
    lines.push("", "No reliable semantic changes since the selected snapshot.");
  }
  const healthChanges = diff.changes.filter((entry) => entry.kind === "warning");
  if (healthChanges.length > 0) {
    lines.push("", `Scan health   ${diff.summary.scanHealth.added} new · ${diff.summary.scanHealth.removed} resolved`);
    for (const change of healthChanges) {
      lines.push(`${change.type === "added" ? "+" : "-"} ${change.label}`, `  ${change.context}`);
    }
  }
  return lines.join("\n");
}

function formatTarget(target: SnapshotDiffResult["from"]): string {
  if (target.kind === "current") return `current (${target.createdAt})`;
  return `${target.id}${target.label ? ` · ${target.label}` : ""}`;
}

function formatValue(value: SnapshotValue | undefined): string {
  if (value === undefined) return "∅";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
