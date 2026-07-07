import type {
  AccessLevel,
  FindingCategory,
  FindingSeverity,
  Scope,
  SkillKind,
  SkillSource,
  ToolId,
  Warning
} from "../types.js";

export const SNAPSHOT_VERSION = 1 as const;
export const SNAPSHOT_RETENTION = 30;

export interface SnapshotMetadata {
  id: string;
  createdAt: string;
  label?: string;
  projects: number;
  entities: number;
  findings: number;
  warnings: number;
}

export interface SnapshotToolState {
  key: string;
  context: string;
  toolId: ToolId;
  detected: boolean;
}

export interface SnapshotEntity {
  key: string;
  context: string;
  toolId: ToolId;
  kind: SkillKind;
  name: string;
  summary: string;
  scope: Scope;
  source: SkillSource;
  sourcePath: string;
  capabilityCategories: string[];
  accessLevel: AccessLevel;
  attributes: Record<string, SnapshotValue>;
}

export interface SnapshotFinding {
  key: string;
  context: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  accessLevel: AccessLevel;
  scope: Scope | "cross_tool";
  toolIds: ToolId[];
  relatedEntityKeys: string[];
}

export interface SnapshotWarning {
  key: string;
  context: string;
  reason: Warning["reason"];
  path?: string;
  message: string;
}

export type SnapshotValue = string | number | boolean | null | SnapshotValue[];

export interface SnapshotDocument {
  version: typeof SNAPSHOT_VERSION;
  id: string;
  createdAt: string;
  label?: string;
  projectCount: number;
  tools: SnapshotToolState[];
  entities: SnapshotEntity[];
  findings: SnapshotFinding[];
  warnings: SnapshotWarning[];
}

export interface SnapshotStoreWarning {
  path: string;
  message: string;
}

export interface SnapshotListResult {
  snapshots: SnapshotMetadata[];
  warnings: SnapshotStoreWarning[];
}

export type DiffTarget =
  | { kind: "snapshot"; id: string; createdAt: string; label?: string }
  | { kind: "current"; createdAt: string };

export interface DiffFieldChange {
  field: string;
  before?: SnapshotValue;
  after?: SnapshotValue;
}

export type DiffItemKind = "tool" | "entity" | "finding" | "warning";
export type DiffChangeType = "added" | "removed" | "modified";

export interface SnapshotDiffChange {
  type: DiffChangeType;
  kind: DiffItemKind;
  key: string;
  context: string;
  label: string;
  toolId?: ToolId;
  severity?: FindingSeverity;
  fields: DiffFieldChange[];
}

export interface SnapshotDiffSummary {
  total: number;
  added: number;
  removed: number;
  modified: number;
  findingsBefore: Record<FindingSeverity, number>;
  findingsAfter: Record<FindingSeverity, number>;
  scanHealth: {
    total: number;
    added: number;
    removed: number;
  };
}

export interface SnapshotDiffResult {
  version: 1;
  from: DiffTarget;
  to: DiffTarget;
  summary: SnapshotDiffSummary;
  changes: SnapshotDiffChange[];
}
