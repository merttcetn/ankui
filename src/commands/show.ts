import { scan, type ScanOptions } from "../scanner/index.js";
import { formatShow, formatShowJson } from "../utils/format-show.js";

export interface ShowCommandOptions extends ScanOptions {
  toolId: string;
  json: boolean;
  write: (chunk: string) => void;
}

export async function runShowCommand(options: ShowCommandOptions): Promise<void> {
  const { toolId, json, write, ...scanOptions } = options;
  const result = await scan(scanOptions);

  if (json) {
    write(formatShowJson(result, toolId));
    return;
  }
  write(`${formatShow(result, toolId)}\n`);
}
