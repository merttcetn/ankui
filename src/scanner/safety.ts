import type { Dirent, Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { createWarning, type Warning } from "../types.js";
import { splitPathSegments } from "./paths.js";

export const MAX_SAFE_FILE_BYTES = 1024 * 1024;
export const MASKED_SECRET = "......";

export type SafeResult<T> =
  | {
      ok: true;
      value: T;
      warnings: Warning[];
    }
  | {
      ok: false;
      warnings: Warning[];
    };

export interface SafetyCheckOptions {
  expectedType?: "file" | "directory" | "any";
  maxBytes?: number;
  warnOnMissing?: boolean;
}

export interface SafePathInfo {
  path: string;
  stat: Stats;
}

export async function checkSafePath(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<SafePathInfo>> {
  const sensitiveWarning = createSensitivePathWarning(filePath);

  if (sensitiveWarning) {
    return safeFailure([sensitiveWarning]);
  }

  let stat: Stats;

  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    const warning = createFsWarning(error, filePath, options.warnOnMissing ?? true);
    return warning ? safeFailure([warning]) : safeFailure([]);
  }

  if (stat.isSymbolicLink()) {
    return safeFailure([
      createWarning({
        reason: "symlink_skipped",
        path: filePath,
        message: `Skipped symlink: ${filePath}`
      })
    ]);
  }

  if (options.expectedType === "file" && !stat.isFile()) {
    return safeFailure([
      createWarning({
        reason: "unknown",
        path: filePath,
        message: `Expected a file but found another filesystem entry: ${filePath}`
      })
    ]);
  }

  if (options.expectedType === "directory" && !stat.isDirectory()) {
    return safeFailure([
      createWarning({
        reason: "unknown",
        path: filePath,
        message: `Expected a directory but found another filesystem entry: ${filePath}`
      })
    ]);
  }

  if (stat.isFile() && stat.size > (options.maxBytes ?? MAX_SAFE_FILE_BYTES)) {
    return safeFailure([
      createWarning({
        reason: "file_too_large",
        path: filePath,
        message: `Skipped file larger than 1 MB: ${filePath}`
      })
    ]);
  }

  return safeSuccess({ path: filePath, stat });
}

export async function safeReadTextFile(
  filePath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<string>> {
  const safety = await checkSafePath(filePath, {
    ...options,
    expectedType: "file"
  });

  if (!safety.ok) {
    return safety;
  }

  try {
    const text = await fs.readFile(filePath, "utf8");
    return safeSuccess(text, safety.warnings);
  } catch (error) {
    const warning = createFsWarning(error, filePath, true);
    return safeFailure([...safety.warnings, warning ?? createUnknownWarning(filePath, error)]);
  }
}

export async function safeReadDirectory(
  directoryPath: string,
  options: SafetyCheckOptions = {}
): Promise<SafeResult<Dirent[]>> {
  const safety = await checkSafePath(directoryPath, {
    ...options,
    expectedType: "directory"
  });

  if (!safety.ok) {
    return safety;
  }

  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return safeSuccess(entries, safety.warnings);
  } catch (error) {
    const warning = createFsWarning(error, directoryPath, true);
    return safeFailure([...safety.warnings, warning ?? createUnknownWarning(directoryPath, error)]);
  }
}

export function isSensitivePath(filePath: string): boolean {
  return createSensitivePathWarning(filePath) !== undefined;
}

export function isSecretLikeKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const compactKey = normalizedKey.replace(/_/g, "");

  return (
    normalizedKey === "auth" ||
    normalizedKey === "authorization" ||
    normalizedKey.includes("token") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("credential") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("passwd") ||
    compactKey.includes("apikey") ||
    compactKey.includes("privatekey") ||
    compactKey.includes("accesstoken") ||
    compactKey.includes("refreshtoken") ||
    compactKey.includes("authtoken") ||
    compactKey.includes("clientsecret")
  );
}

export function maskSecrets<T>(value: T): T {
  return sanitizeValue(value, false) as T;
}

export function maskSecretText(text: string): string {
  return text
    .replace(
      /((?:["']?)\b[\w.-]*(?:token|secret|credential|password|passwd|api[_-]?key|apikey|private[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret)[\w.-]*\b(?:["']?)\s*[:=]\s*)(["']?)[^"',\s}]+(["']?)/gi,
      (_match, prefix: string, openQuote: string, closeQuote: string) =>
        `${prefix}${openQuote}${MASKED_SECRET}${closeQuote || openQuote}`
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${MASKED_SECRET}`)
    .replace(
      /([?&](?:token|secret|password|api_key|apikey|access_token|refresh_token)=)[^&\s]+/gi,
      `$1${MASKED_SECRET}`
    )
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, MASKED_SECRET)
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, MASKED_SECRET);
}

function createSensitivePathWarning(filePath: string): Warning | undefined {
  if (!hasSensitivePathSegment(filePath)) {
    return undefined;
  }

  return createWarning({
    reason: "sensitive_file_skipped",
    path: filePath,
    message: `Skipped sensitive path: ${filePath}`
  });
}

function hasSensitivePathSegment(filePath: string): boolean {
  const segments = splitPathSegments(filePath);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const isOpenCodePath = lowerSegments.some(
    (segment) => segment === "opencode" || segment === ".opencode"
  );

  return lowerSegments.some((segment) => {
    const basename = path.basename(segment);

    return (
      isSensitiveName(basename) ||
      isCommonSensitiveDirectoryName(basename) ||
      (isOpenCodePath && isOpenCodeSensitiveDirectoryName(basename))
    );
  });
}

function isSensitiveName(name: string): boolean {
  return (
    name === ".env" ||
    name.startsWith(".env") ||
    name.includes("token") ||
    name.includes("secret") ||
    name.includes("credential") ||
    name.startsWith("auth") ||
    name.startsWith("cookies") ||
    name.startsWith("session") ||
    name.endsWith(".pem") ||
    name.endsWith(".key") ||
    name.includes("apikey") ||
    name.includes("api_key") ||
    name.startsWith("private_key")
  );
}

function isCommonSensitiveDirectoryName(name: string): boolean {
  return (
    name === "sessions" ||
    name === "session" ||
    name === "history" ||
    name === "histories" ||
    name === "conversation" ||
    name === "conversations"
  );
}

function isOpenCodeSensitiveDirectoryName(name: string): boolean {
  return (
    name === "auth" ||
    name === "log" ||
    name === "logs" ||
    name === "share" ||
    name === "cache" ||
    name === "database" ||
    name === "databases" ||
    name === "db" ||
    name === "runtime" ||
    isCommonSensitiveDirectoryName(name)
  );
}

function sanitizeValue(value: unknown, inEnvBlock: boolean): unknown {
  if (Array.isArray(value)) {
    return inEnvBlock ? value.map(maskSecretValue) : value.map((item) => sanitizeValue(item, false));
  }

  if (!isRecord(value)) {
    return inEnvBlock ? MASKED_SECRET : value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (key.toLowerCase() === "env" && isRecord(entryValue)) {
      sanitized[key] = maskEnvBlock(entryValue);
      continue;
    }

    if (inEnvBlock || isSecretLikeKey(key)) {
      sanitized[key] = maskSecretValue(entryValue);
      continue;
    }

    sanitized[key] = sanitizeValue(entryValue, false);
  }

  return sanitized;
}

function maskEnvBlock(env: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(env).map((key) => [key, MASKED_SECRET]));
}

function maskSecretValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecretValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).map((key) => [key, MASKED_SECRET]));
  }

  return MASKED_SECRET;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function safeSuccess<T>(value: T, warnings: Warning[] = []): SafeResult<T> {
  return {
    ok: true,
    value,
    warnings
  };
}

function safeFailure<T = never>(warnings: Warning[]): SafeResult<T> {
  return {
    ok: false,
    warnings
  };
}

function createFsWarning(
  error: unknown,
  filePath: string,
  warnOnMissing: boolean
): Warning | undefined {
  if (isNodeError(error)) {
    if (error.code === "ENOENT" && !warnOnMissing) {
      return undefined;
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      return createWarning({
        reason: "permission_denied",
        path: filePath,
        message: `Permission denied while reading: ${filePath}`
      });
    }
  }

  return createUnknownWarning(filePath, error);
}

function createUnknownWarning(filePath: string, error: unknown): Warning {
  return createWarning({
    reason: "unknown",
    path: filePath,
    message: `Could not read ${filePath}: ${formatErrorMessage(error)}`
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
