import fs from "node:fs/promises";
import path from "node:path";

import type { ToolId } from "../types.js";

export interface BundleRegistry {
  version: 1;
  bundles: BundleEntry[];
}

export interface BundleEntry {
  name: string;
  url: string;
  pinnedSha: string;
  pinnedCommitMessage: string;
  installedAt: string;
  updatedAt: string;
  scope: "user" | "project";
  projectCwd?: string;
  installs: BundleInstall[];
}

export interface BundleInstall {
  toolId: ToolId;
  skillName: string;
  bundlePath: string;
  symlinkPath: string;
}

export function getRegistryPath(homeDir: string): string {
  return path.join(homeDir, ".ankui", "bundles", "registry.json");
}

export async function readRegistry(homeDir: string): Promise<BundleRegistry> {
  const p = getRegistryPath(homeDir);
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!isBundleRegistry(parsed)) {
      throw new Error(`unexpected registry shape in ${p}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, bundles: [] };
    }
    throw error;
  }
}

export async function writeRegistry(homeDir: string, reg: BundleRegistry): Promise<void> {
  const p = getRegistryPath(homeDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(reg, null, 2)}\n`, "utf8");
  await fs.rename(tmp, p);
}

const locks = new Map<string, Promise<unknown>>();

export function withRegistryLock<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(homeDir);
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

function isBundleRegistry(value: unknown): value is BundleRegistry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && Array.isArray(v.bundles);
}
