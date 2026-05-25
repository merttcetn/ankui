import fs from "node:fs/promises";
import path from "node:path";

import { hasSensitivePathSegment } from "../scanner/safety.js";

export interface BundleSkill {
  skillName: string;
  skillMdPath: string;
}

const SKIP_DIRS = new Set([".git", ".disabled", "node_modules"]);

export async function findBundleSkills(bundleDir: string): Promise<BundleSkill[]> {
  const out: BundleSkill[] = [];
  await walk(bundleDir, out);
  return out;
}

async function walk(dir: string, out: BundleSkill[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (hasSensitivePathSegment(abs)) continue;
      await walk(abs, out);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      if (hasSensitivePathSegment(abs)) continue;
      out.push({
        skillName: path.basename(path.dirname(abs)),
        skillMdPath: abs
      });
    }
    // symlinks: do not follow in v1 (bundle should be plain files)
  }
}
