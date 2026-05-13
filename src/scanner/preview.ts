import {
  maskSecretText,
  safeReadTextFile,
  type SafeResult,
  type SafetyCheckOptions
} from "./safety.js";

export const DEFAULT_PREVIEW_LINES = 10;

export interface Preview {
  sourcePath: string;
  lines: string[];
  truncated: boolean;
}

export async function readSanitizedPreview(
  filePath: string,
  options: SafetyCheckOptions & { maxLines?: number } = {}
): Promise<SafeResult<Preview>> {
  const text = await safeReadTextFile(filePath, options);

  if (!text.ok) {
    return text;
  }

  return {
    ok: true,
    value: createSanitizedPreview(text.value, filePath, options.maxLines),
    warnings: text.warnings
  };
}

export function createSanitizedPreview(
  text: string,
  sourcePath: string,
  maxLines = DEFAULT_PREVIEW_LINES
): Preview {
  const normalizedLines = splitNormalizedLines(text);
  const previewLines = normalizedLines.slice(0, maxLines).map((line) => maskSecretText(line));

  return {
    sourcePath,
    lines: previewLines,
    truncated: normalizedLines.length > maxLines
  };
}

export function countTextLines(text: string): number {
  return splitNormalizedLines(text).length;
}

function splitNormalizedLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
