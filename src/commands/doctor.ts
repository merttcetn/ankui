import { scan, type ScanOptions } from "../scanner/index.js";
import { formatDoctor, formatDoctorJson } from "../utils/format-doctor.js";

export interface DoctorCommandOptions extends ScanOptions {
  json: boolean;
  write: (chunk: string) => void;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  const { json, write, ...scanOptions } = options;
  const result = await scan(scanOptions);

  if (json) {
    write(formatDoctorJson(result));
    return;
  }

  write(`${formatDoctor(result)}\n`);
}
