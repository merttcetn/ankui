import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createWarning, type Warning } from "../types.js";

export const ANKUI_CONFIG_VERSION = 1;

export interface AnkuiConfig {
  version: 1;
  devRoots: string[];
}

export function getAnkuiConfigPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".config", "ankui", "config.json");
}

export async function readAnkuiConfig(
  homeDir: string = os.homedir()
): Promise<{ config: AnkuiConfig; warnings: Warning[] }> {
  const configPath = getAnkuiConfigPath(homeDir);
  let raw: string;

  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { config: emptyConfig(), warnings: [] };
    }
    return {
      config: emptyConfig(),
      warnings: [
        createWarning({
          reason: "parse_failed",
          path: configPath,
          message: `Could not read ${configPath}: ${formatErrorMessage(error)}`
        })
      ]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      config: emptyConfig(),
      warnings: [
        createWarning({
          reason: "parse_failed",
          path: configPath,
          message: `Could not parse ${configPath} as JSON: ${formatErrorMessage(error)}`
        })
      ]
    };
  }

  if (!isAnkuiConfigShape(parsed)) {
    return {
      config: emptyConfig(),
      warnings: [
        createWarning({
          reason: "parse_failed",
          path: configPath,
          message: `Unexpected shape in ${configPath}; expected { version: 1, devRoots: string[] }`
        })
      ]
    };
  }

  return {
    config: {
      version: 1,
      devRoots: normalizeDevRoots(parsed.devRoots)
    },
    warnings: []
  };
}

export async function writeAnkuiConfig(
  config: AnkuiConfig,
  homeDir: string = os.homedir()
): Promise<void> {
  const finalPath = getAnkuiConfigPath(homeDir);
  const tmpPath = `${finalPath}.tmp`;
  const dir = path.dirname(finalPath);
  await fs.mkdir(dir, { recursive: true });

  const payload: AnkuiConfig = {
    version: ANKUI_CONFIG_VERSION,
    devRoots: normalizeDevRoots(config.devRoots)
  };

  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, finalPath);
}

export function mergeDevRoots(
  existing: readonly string[],
  incoming: readonly string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of [...existing, ...incoming]) {
    const trimmed = typeof entry === "string" ? entry.trim() : "";
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function emptyConfig(): AnkuiConfig {
  return { version: ANKUI_CONFIG_VERSION, devRoots: [] };
}

function isAnkuiConfigShape(value: unknown): value is { version: unknown; devRoots: unknown[] } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.devRoots);
}

export function normalizeDevRoots(input: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
