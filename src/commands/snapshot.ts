import os from "node:os";

import type { ScanOptions } from "../scanner/index.js";
import type { ScanResult } from "../types.js";
import { captureSnapshot } from "../snapshots/service.js";
import { deleteSnapshot, listSnapshots } from "../snapshots/store.js";
import {
  formatSnapshotCreated,
  formatSnapshotDeleted,
  formatSnapshotList
} from "../utils/format-snapshot.js";

interface BaseOptions {
  json: boolean;
  write: (chunk: string) => void;
  writeError?: (chunk: string) => void;
  homeDir?: string;
}

export interface SnapshotCreateOptions extends BaseOptions {
  label?: string;
  env?: Record<string, string | undefined>;
  devRoots?: readonly string[];
  now?: Date;
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

export async function runSnapshotCreateCommand(options: SnapshotCreateOptions): Promise<number> {
  try {
    const result = await captureSnapshot({
      homeDir: options.homeDir,
      label: options.label,
      env: options.env,
      devRoots: options.devRoots,
      now: options.now,
      __scanForTesting: options.__scanForTesting
    });
    options.write(options.json
      ? `${JSON.stringify({ snapshot: result.metadata, pruned: result.pruned, warnings: result.retentionWarnings }, null, 2)}\n`
      : `${formatSnapshotCreated(result.metadata, result.pruned)}${result.retentionWarnings.map((warning) => `\n! ${warning}`).join("")}\n`);
    return 0;
  } catch (error) {
    (options.writeError ?? options.write)(`${formatError(error)}\n`);
    return 1;
  }
}

export async function runSnapshotListCommand(options: BaseOptions): Promise<number> {
  try {
    const result = await listSnapshots(options.homeDir ?? os.homedir());
    options.write(options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatSnapshotList(result)}\n`);
    return 0;
  } catch (error) {
    (options.writeError ?? options.write)(`${formatError(error)}\n`);
    return 1;
  }
}

export async function runSnapshotDeleteCommand(
  options: BaseOptions & { id: string; yes: boolean }
): Promise<number> {
  if (!options.yes) {
    (options.writeError ?? options.write)("ankui snapshot delete: pass --yes to confirm deletion\n");
    return 1;
  }
  try {
    const snapshot = await deleteSnapshot(options.homeDir ?? os.homedir(), options.id);
    options.write(options.json
      ? `${JSON.stringify({ deleted: snapshot }, null, 2)}\n`
      : `${formatSnapshotDeleted(snapshot)}\n`);
    return 0;
  } catch (error) {
    (options.writeError ?? options.write)(`${formatError(error)}\n`);
    return 1;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
