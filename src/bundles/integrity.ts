import fs from "node:fs/promises";
import path from "node:path";

import { createWarning, type Warning } from "../types.js";
import { readRegistry } from "./registry.js";

/**
 * Walks the bundle registry and surfaces integrity issues:
 * - `bundle_dir_missing` — registry has an entry whose clone dir is gone
 * - `symlink_missing` — an install's symlink path is absent
 * - `symlink_diverged` — symlink exists but no longer resolves to the recorded bundlePath
 *
 * Returns an empty array if the registry is empty or unreadable.
 */
export async function checkBundleIntegrity(homeDir: string): Promise<Warning[]> {
  const warnings: Warning[] = [];
  let registry;
  try {
    registry = await readRegistry(homeDir);
  } catch {
    return warnings;
  }

  for (const entry of registry.bundles) {
    const bundleDir = path.join(homeDir, ".ankui", "bundles", ...entry.name.split("/"));
    let bundleDirExists = false;
    try {
      const stat = await fs.lstat(bundleDir);
      bundleDirExists = stat.isDirectory();
    } catch {
      bundleDirExists = false;
    }
    if (!bundleDirExists) {
      warnings.push(createWarning({
        reason: "bundle_dir_missing",
        path: bundleDir,
        message: `bundle clone directory missing for ${entry.name}`
      }));
      // Don't emit per-install symlink warnings when the whole bundle is gone — too noisy.
      continue;
    }

    for (const inst of entry.installs) {
      let stat: import("node:fs").Stats | null = null;
      try {
        stat = await fs.lstat(inst.symlinkPath);
      } catch {
        stat = null;
      }
      if (!stat) {
        warnings.push(createWarning({
          reason: "symlink_missing",
          path: inst.symlinkPath,
          message: `expected symlink missing: ${entry.name} → ${inst.skillName}`
        }));
        continue;
      }
      if (!stat.isSymbolicLink()) {
        warnings.push(createWarning({
          reason: "symlink_diverged",
          path: inst.symlinkPath,
          message: `path is no longer a symlink (user took ownership?): ${entry.name} → ${inst.skillName}`
        }));
        continue;
      }
      let resolved: string;
      try {
        const target = await fs.readlink(inst.symlinkPath);
        resolved = path.resolve(path.dirname(inst.symlinkPath), target);
      } catch {
        warnings.push(createWarning({
          reason: "symlink_diverged",
          path: inst.symlinkPath,
          message: `failed to read symlink target: ${entry.name} → ${inst.skillName}`
        }));
        continue;
      }
      if (resolved !== inst.bundlePath) {
        warnings.push(createWarning({
          reason: "symlink_diverged",
          path: inst.symlinkPath,
          message: `symlink target diverged: expected ${inst.bundlePath}, got ${resolved}`
        }));
      }
    }
  }

  return warnings;
}
