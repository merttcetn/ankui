import { scan, type ScanOptions } from "../scanner/index.js";
import { formatMcpOverview, formatMcpOverviewJson } from "../utils/format-mcp.js";

export interface McpCommandOptions extends ScanOptions {
  json: boolean;
  write: (chunk: string) => void;
}

export async function runMcpCommand(options: McpCommandOptions): Promise<void> {
  const { json, write, ...scanOptions } = options;
  const result = await scan(scanOptions);

  if (json) {
    write(formatMcpOverviewJson(result));
    return;
  }

  write(`${formatMcpOverview(result)}\n`);
}
