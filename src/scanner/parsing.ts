import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

import { createWarning } from "../types.js";
import {
  maskSecretText,
  maskSecrets,
  safeReadTextFile,
  type SafeResult,
  type SafetyCheckOptions
} from "./safety.js";

export async function readJsonFile(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<unknown>> {
  const text = await safeReadTextFile(filePath, options);

  if (!text.ok) {
    return text;
  }

  const parsed = parseJsonText(text.value, filePath);

  if (!parsed.ok) {
    return {
      ok: false,
      warnings: [...text.warnings, ...parsed.warnings]
    };
  }

  return {
    ok: true,
    value: parsed.value,
    warnings: [...text.warnings, ...parsed.warnings]
  };
}

export async function readJsoncFile(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<unknown>> {
  const text = await safeReadTextFile(filePath, options);

  if (!text.ok) {
    return text;
  }

  const parsed = parseJsoncText(text.value, filePath);

  if (!parsed.ok) {
    return {
      ok: false,
      warnings: [...text.warnings, ...parsed.warnings]
    };
  }

  return {
    ok: true,
    value: parsed.value,
    warnings: [...text.warnings, ...parsed.warnings]
  };
}

export async function readTomlFile(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<unknown>> {
  const text = await safeReadTextFile(filePath, options);

  if (!text.ok) {
    return text;
  }

  const parsed = parseTomlText(text.value, filePath);

  if (!parsed.ok) {
    return {
      ok: false,
      warnings: [...text.warnings, ...parsed.warnings]
    };
  }

  return {
    ok: true,
    value: parsed.value,
    warnings: [...text.warnings, ...parsed.warnings]
  };
}

export async function readMarkdownFile(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<string>> {
  const text = await safeReadTextFile(filePath, options);

  if (!text.ok) {
    return text;
  }

  return {
    ok: true,
    value: maskSecretText(text.value),
    warnings: text.warnings
  };
}

export function parseJsonText(text: string, sourcePath: string): SafeResult<unknown> {
  try {
    return {
      ok: true,
      value: maskSecrets(JSON.parse(text) as unknown),
      warnings: []
    };
  } catch (error) {
    return createParseFailure(sourcePath, error);
  }
}

export function parseJsoncText(text: string, sourcePath: string): SafeResult<unknown> {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false
  }) as unknown;

  if (errors.length > 0) {
    return createParseFailure(
      sourcePath,
      `JSONC parse error: ${errors.map((error) => printParseErrorCode(error.error)).join(", ")}`
    );
  }

  return {
    ok: true,
    value: maskSecrets(parsed),
    warnings: []
  };
}

export function parseTomlText(text: string, sourcePath: string): SafeResult<unknown> {
  try {
    return {
      ok: true,
      value: maskSecrets(parseToml(text) as unknown),
      warnings: []
    };
  } catch (error) {
    return createParseFailure(sourcePath, error);
  }
}

function createParseFailure(sourcePath: string, error: unknown): SafeResult<never> {
  const message = error instanceof Error ? error.message : String(error);

  return {
    ok: false,
    warnings: [
      createWarning({
        reason: "parse_failed",
        path: sourcePath,
        message: `Could not parse ${sourcePath}: ${message}`
      })
    ]
  };
}
