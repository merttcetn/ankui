import os from "node:os";

import { loadAllScans, readDevRootsConfig } from "../scanner/multi-project.js";
import type { ScanOptions } from "../scanner/index.js";
import type { ScanResult } from "../types.js";
import {
  formatMultiProjectJson,
  formatMultiProjectSummary
} from "../utils/format-multi-project.js";

export interface ScanAllCommandOptions {
  json: boolean;
  write: (chunk: string) => void;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  /** Override the dev roots read from ~/.config/ankui/config.json. */
  devRoots?: readonly string[];
  /** Fixed clock for deterministic tests. */
  now?: Date;
  /** Test hook — forwarded to loadAllScans. Not for production. */
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

export async function runScanAllCommand(options: ScanAllCommandOptions): Promise<void> {
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

  // Merge config-read warnings into the aggregate result so they surface in output.
  result.warnings = [...configWarnings, ...result.warnings];

  if (options.json) {
    options.write(formatMultiProjectJson(result));
    return;
  }

  options.write(`${formatMultiProjectSummary(result)}\n`);
}
