import os from "node:os";

import type { ScanOptions } from "../scanner/index.js";
import type { ScanResult } from "../types.js";
import { diffSnapshots } from "../snapshots/diff.js";
import { buildSnapshotDocument } from "../snapshots/model.js";
import { loadSnapshotInventory } from "../snapshots/service.js";
import { readSnapshot } from "../snapshots/store.js";
import { formatSnapshotDiff } from "../utils/format-snapshot.js";

export interface DiffCommandOptions {
  from?: string;
  to?: string;
  json: boolean;
  write: (chunk: string) => void;
  writeError?: (chunk: string) => void;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  devRoots?: readonly string[];
  now?: Date;
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

export async function runDiffCommand(options: DiffCommandOptions): Promise<number> {
  const homeDir = options.homeDir ?? os.homedir();
  try {
    const from = await readSnapshot(homeDir, options.from ?? "latest");
    const toSelector = options.to ?? "current";
    let to;
    let toCurrent = false;
    if (toSelector === "current") {
      const scan = await loadSnapshotInventory({
        homeDir,
        env: options.env,
        devRoots: options.devRoots,
        now: options.now,
        __scanForTesting: options.__scanForTesting
      });
      to = buildSnapshotDocument(scan, { id: "current", createdAt: scan.scannedAt });
      toCurrent = true;
    } else {
      to = await readSnapshot(homeDir, toSelector);
      if (to.createdAt < from.createdAt) {
        throw new Error("the --to snapshot must be newer than the --from snapshot");
      }
    }
    const diff = diffSnapshots(from, to, { toCurrent });
    options.write(options.json
      ? `${JSON.stringify(diff, null, 2)}\n`
      : `${formatSnapshotDiff(diff)}\n`);
    return 0;
  } catch (error) {
    (options.writeError ?? options.write)(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
