import fs from "node:fs/promises";
import path from "node:path";

import { isSensitivePath } from "../scanner/safety.js";
import {
  PROJECT_MARKER_DIRS,
  PROJECT_MARKER_FILES
} from "../scanner/multi-project.js";

export interface CollectWatchPathsOptions {
  homeDir: string;
  devRoots: readonly string[];
}

const USER_SCOPE_RELATIVE_PATHS: readonly string[] = [
  ".claude",
  ".claude.json",
  ".codex",
  ".cursor",
  ".gemini",
  ".config/opencode",
  ".skills",
  ".config/skills"
];

export async function collectWatchPaths(
  options: CollectWatchPathsOptions
): Promise<string[]> {
  const collected = new Set<string>();

  // User-scope: known tool config dirs/files under homeDir, only if they exist
  // and are not sensitive.
  for (const rel of USER_SCOPE_RELATIVE_PATHS) {
    const candidate = path.join(options.homeDir, rel);
    if (isSensitivePath(candidate)) continue;
    if (await pathExists(candidate)) {
      collected.add(candidate);
    }
  }

  // Project-scope: every immediate child of each dev root that has an AI marker.
  for (const devRoot of options.devRoots) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(devRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const projectPath = path.join(devRoot, entry.name);
      if (isSensitivePath(projectPath)) continue;
      if (await hasProjectMarker(projectPath)) {
        collected.add(projectPath);
      }
    }
  }

  return [...collected].sort();
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectMarker(projectPath: string): Promise<boolean> {
  for (const dirName of PROJECT_MARKER_DIRS) {
    try {
      const stat = await fs.stat(path.join(projectPath, dirName));
      if (stat.isDirectory()) return true;
    } catch {
      // not present
    }
  }
  for (const fileName of PROJECT_MARKER_FILES) {
    try {
      const stat = await fs.stat(path.join(projectPath, fileName));
      if (stat.isFile()) return true;
    } catch {
      // not present
    }
  }
  return false;
}
