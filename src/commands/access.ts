import { scan, type ScanOptions } from "../scanner/index.js";
import { formatAccessReview, formatAccessReviewJson } from "../utils/format-access.js";

export interface AccessCommandOptions extends ScanOptions {
  json: boolean;
  write: (chunk: string) => void;
}

export async function runAccessCommand(options: AccessCommandOptions): Promise<void> {
  const { json, write, ...scanOptions } = options;
  const result = await scan(scanOptions);

  if (json) {
    write(formatAccessReviewJson(result));
    return;
  }

  write(`${formatAccessReview(result)}\n`);
}
