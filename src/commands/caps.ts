import { scan, type ScanOptions } from "../scanner/index.js";
import { formatCapabilities, formatCapabilitiesJson } from "../utils/format-caps.js";

export interface CapsCommandOptions extends ScanOptions {
  json: boolean;
  write: (chunk: string) => void;
}

export async function runCapsCommand(options: CapsCommandOptions): Promise<void> {
  const { json, write, ...scanOptions } = options;
  const result = await scan(scanOptions);

  if (json) {
    write(formatCapabilitiesJson(result));
    return;
  }

  write(`${formatCapabilities(result)}\n`);
}
