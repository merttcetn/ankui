import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { snapshotMetadata } from "./model.js";
import {
  SNAPSHOT_RETENTION,
  SNAPSHOT_VERSION,
  type SnapshotDocument,
  type SnapshotListResult,
  type SnapshotMetadata
} from "./types.js";

const ID_RE = /^\d{8}T\d{9}Z-[a-f0-9]{8}$/;

export function getSnapshotsDir(homeDir: string): string {
  return path.join(homeDir, ".ankui", "snapshots");
}

export function createSnapshotId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(".", "");
  return `${timestamp}-${crypto.randomBytes(4).toString("hex")}`;
}

export function validateSnapshotLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 80) throw new Error("snapshot label must be 80 characters or fewer");
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("snapshot label contains control characters");
  return trimmed;
}

export async function writeSnapshot(
  homeDir: string,
  document: SnapshotDocument
): Promise<{ metadata: SnapshotMetadata; pruned: string[]; retentionWarnings: string[] }> {
  if (!ID_RE.test(document.id)) throw new Error("invalid snapshot id");
  const dir = getSnapshotsDir(homeDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const finalPath = snapshotPath(homeDir, document.id);
  const tmpPath = `${finalPath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  try {
    await fs.rename(tmpPath, finalPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
  const retention = await pruneSnapshots(homeDir);
  return {
    metadata: snapshotMetadata(document),
    pruned: retention.pruned,
    retentionWarnings: retention.warnings
  };
}

export async function listSnapshots(homeDir: string): Promise<SnapshotListResult> {
  const dir = getSnapshotsDir(homeDir);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { snapshots: [], warnings: [] };
    throw error;
  }
  const snapshots: SnapshotMetadata[] = [];
  const warnings: SnapshotListResult["warnings"] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(dir, entry.name);
    try {
      const document = await readSnapshotFile(filePath);
      snapshots.push(snapshotMetadata(document));
    } catch (error) {
      warnings.push({
        path: filePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { snapshots, warnings };
}

export async function readSnapshot(homeDir: string, idOrPrefix: string): Promise<SnapshotDocument> {
  const id = await resolveSnapshotId(homeDir, idOrPrefix);
  return readSnapshotFile(snapshotPath(homeDir, id));
}

export async function deleteSnapshot(homeDir: string, idOrPrefix: string): Promise<SnapshotMetadata> {
  const document = await readSnapshot(homeDir, idOrPrefix);
  await fs.unlink(snapshotPath(homeDir, document.id));
  return snapshotMetadata(document);
}

export async function resolveSnapshotId(homeDir: string, idOrPrefix: string): Promise<string> {
  if (!/^[a-zA-Z0-9-]+$/.test(idOrPrefix)) throw new Error("invalid snapshot id");
  const { snapshots } = await listSnapshots(homeDir);
  if (idOrPrefix === "latest") {
    if (!snapshots[0]) throw new Error("no snapshots found; run `ankui snapshot`");
    return snapshots[0].id;
  }
  const matches = snapshots.filter((snapshot) => snapshot.id.startsWith(idOrPrefix));
  if (matches.length === 0) throw new Error(`snapshot not found: ${idOrPrefix}`);
  if (matches.length > 1) throw new Error(`snapshot id prefix is ambiguous: ${idOrPrefix}`);
  return matches[0].id;
}

async function pruneSnapshots(homeDir: string): Promise<{ pruned: string[]; warnings: string[] }> {
  const { snapshots } = await listSnapshots(homeDir);
  const excess = snapshots.slice(SNAPSHOT_RETENTION);
  const pruned: string[] = [];
  const warnings: string[] = [];
  for (const snapshot of excess) {
    try {
      await fs.unlink(snapshotPath(homeDir, snapshot.id));
      pruned.push(snapshot.id);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        warnings.push(`could not prune ${snapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { pruned, warnings };
}

async function readSnapshotFile(filePath: string): Promise<SnapshotDocument> {
  const raw = await fs.readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid snapshot JSON");
  }
  if (!isSnapshotDocument(parsed)) throw new Error("unsupported or malformed snapshot");
  return parsed;
}

function snapshotPath(homeDir: string, id: string): string {
  if (!ID_RE.test(id)) throw new Error("invalid snapshot id");
  return path.join(getSnapshotsDir(homeDir), `${id}.json`);
}

function isSnapshotDocument(value: unknown): value is SnapshotDocument {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.version === SNAPSHOT_VERSION &&
    typeof record.id === "string" && ID_RE.test(record.id) &&
    typeof record.createdAt === "string" &&
    (record.label === undefined || typeof record.label === "string") &&
    typeof record.projectCount === "number" &&
    Array.isArray(record.tools) && record.tools.every((entry) =>
      isKeyedContext(entry) && typeof entry.toolId === "string" && typeof entry.detected === "boolean"
    ) &&
    Array.isArray(record.entities) && record.entities.every((entry) =>
      isKeyedContext(entry) && typeof entry.toolId === "string" &&
      typeof entry.kind === "string" && typeof entry.name === "string" &&
      typeof entry.summary === "string" && typeof entry.sourcePath === "string" &&
      Array.isArray(entry.capabilityCategories) &&
      Boolean(entry.attributes && typeof entry.attributes === "object" && !Array.isArray(entry.attributes))
    ) &&
    Array.isArray(record.findings) && record.findings.every((entry) =>
      isKeyedContext(entry) && typeof entry.title === "string" &&
      typeof entry.category === "string" && typeof entry.severity === "string" &&
      Array.isArray(entry.toolIds) && Array.isArray(entry.relatedEntityKeys)
    ) &&
    Array.isArray(record.warnings) && record.warnings.every((entry) =>
      isKeyedContext(entry) && typeof entry.reason === "string" && typeof entry.message === "string"
    );
}

function isKeyedContext(value: unknown): value is Record<string, unknown> & { key: string; context: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" && typeof record.context === "string";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
