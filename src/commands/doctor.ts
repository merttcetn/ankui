import os from "node:os";

import { checkBundleIntegrity } from "../bundles/integrity.js";
import { scan, type ScanOptions } from "../scanner/index.js";
import { formatDoctor, formatDoctorJson } from "../utils/format-doctor.js";

export interface DoctorCommandOptions extends ScanOptions {
  json: boolean;
  color?: boolean;
  write: (chunk: string) => void;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  const { json, color, write, ...scanOptions } = options;
  const result = await scan(scanOptions);
  const resolvedHomeDir = scanOptions.homeDir ?? os.homedir();
  const bundleWarnings = await checkBundleIntegrity(resolvedHomeDir);
  const merged = {
    ...result,
    warnings: [...result.warnings, ...bundleWarnings]
  };

  if (json) {
    write(formatDoctorJson(merged));
    return;
  }

  write(`${formatDoctor(merged, { color })}\n`);
}
