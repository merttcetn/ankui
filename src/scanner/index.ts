import os from "node:os";

import {
  createAllEmptyTools,
  createScanSummary,
  type ScanResult
} from "../types.js";

export interface ScanOptions {
  cwd?: string;
  homeDir?: string;
  now?: Date;
}

export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const tools = createAllEmptyTools();

  return {
    scannedAt: (options.now ?? new Date()).toISOString(),
    cwd: options.cwd ?? process.cwd(),
    homeDir: options.homeDir ?? os.homedir(),
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}
