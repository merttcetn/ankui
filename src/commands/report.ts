import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadAllScans, readDevRootsConfig } from "../scanner/multi-project.js";
import type { ScanOptions } from "../scanner/index.js";
import type { ScanResult } from "../types.js";
import {
  buildSanitizedReportModel,
  renderSanitizedReportJson,
  renderSanitizedReportMarkdown
} from "../report/sanitized-report.js";

export interface ReportCommandOptions {
  json: boolean;
  write: (chunk: string) => void;
  output?: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  devRoots?: readonly string[];
  now?: Date;
  /** Test hook — forwarded to loadAllScans. Not for production. */
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

export async function runReportCommand(
  options: ReportCommandOptions
): Promise<void> {
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

  const model = buildSanitizedReportModel(result, {
    generatedAt: options.now
  });
  const payload = options.json
    ? renderSanitizedReportJson(model)
    : renderSanitizedReportMarkdown(model);

  if (!options.output) {
    options.write(payload);
    return;
  }

  await writeNewFile(options.output, payload);
  options.write(`Wrote sanitized report to ${options.output}\n`);
}

async function writeNewFile(filePath: string, contents: string): Promise<void> {
  const parent = path.dirname(path.resolve(filePath));
  let parentStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    parentStat = await fs.stat(parent);
  } catch {
    throw new Error(`output parent directory does not exist: ${parent}`);
  }
  if (!parentStat.isDirectory()) {
    throw new Error(`output parent is not a directory: ${parent}`);
  }

  try {
    await fs.writeFile(filePath, contents, { flag: "wx" });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(`output file already exists: ${filePath}`);
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
