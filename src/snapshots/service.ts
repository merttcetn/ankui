import os from "node:os";

import { readDevRootsConfig, loadAllScans } from "../scanner/multi-project.js";
import type { ScanOptions } from "../scanner/index.js";
import type { MultiProjectScanResult, ScanResult } from "../types.js";
import { buildSnapshotDocument } from "./model.js";
import { createSnapshotId, validateSnapshotLabel, writeSnapshot } from "./store.js";
import type { SnapshotDocument, SnapshotMetadata } from "./types.js";

export interface SnapshotScanOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
  devRoots?: readonly string[];
  now?: Date;
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

export async function loadSnapshotInventory(
  options: SnapshotScanOptions = {}
): Promise<MultiProjectScanResult> {
  const homeDir = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;
  let devRoots: readonly string[];
  let configWarnings: Awaited<ReturnType<typeof readDevRootsConfig>>["warnings"] = [];
  if (options.devRoots !== undefined) {
    devRoots = options.devRoots;
  } else {
    const config = await readDevRootsConfig(homeDir);
    devRoots = config.devRoots;
    configWarnings = config.warnings;
  }
  const result = await loadAllScans({
    devRoots,
    homeDir,
    env,
    now: options.now,
    __scanForTesting: options.__scanForTesting
  });
  result.warnings = [...configWarnings, ...result.warnings];
  return result;
}

export async function createSnapshotFromScan(
  scan: MultiProjectScanResult,
  options: { homeDir?: string; label?: string; now?: Date } = {}
): Promise<{
  document: SnapshotDocument;
  metadata: SnapshotMetadata;
  pruned: string[];
  retentionWarnings: string[];
}> {
  const homeDir = options.homeDir ?? scan.homeDir;
  const now = options.now ?? new Date(scan.scannedAt);
  const label = validateSnapshotLabel(options.label);
  const document = buildSnapshotDocument(scan, {
    id: createSnapshotId(now),
    createdAt: scan.scannedAt,
    label
  });
  const written = await writeSnapshot(homeDir, document);
  return {
    document,
    metadata: written.metadata,
    pruned: written.pruned,
    retentionWarnings: written.retentionWarnings
  };
}

export async function captureSnapshot(
  options: SnapshotScanOptions & { label?: string } = {}
): Promise<{
  scan: MultiProjectScanResult;
  document: SnapshotDocument;
  metadata: SnapshotMetadata;
  pruned: string[];
  retentionWarnings: string[];
}> {
  const scan = await loadSnapshotInventory(options);
  const saved = await createSnapshotFromScan(scan, {
    homeDir: options.homeDir,
    label: options.label,
    now: options.now
  });
  return { scan, ...saved };
}
