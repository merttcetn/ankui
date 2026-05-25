import fs from "node:fs/promises";
import path from "node:path";

import { readRegistry, writeRegistry, withRegistryLock } from "../bundles/registry.js";
import { removeSymlink } from "../writer/symlink.js";
import { appendAudit } from "../bundles/audit.js";
import type { CommandResult } from "./add.js";

export interface RemoveCommandInput {
  name: string;
  flags: { yes?: boolean; keepClone?: boolean };
  homeDir: string;
  cwd: string;
}

export async function runRemoveCommand(input: RemoveCommandInput): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await withRegistryLock(input.homeDir, async () => {
    const reg = await readRegistry(input.homeDir);
    const idx = reg.bundles.findIndex((b) => b.name === input.name);
    if (idx === -1) {
      stderr.push(`bundle not found: ${input.name}`);
      return 1;
    }
    const entry = reg.bundles[idx];
    // Project-scope bundles were installed under their original cwd; pulling
    // input.cwd would put removeSymlink's allowlist somewhere unrelated and
    // every unlink would be rejected as "outside allowed roots", leaving the
    // symlink behind while we happily delete the registry + clone.
    const removeCwd = entry.scope === "project" ? (entry.projectCwd ?? input.cwd) : input.cwd;
    const allowedRoots = [input.homeDir, removeCwd];

    for (const inst of entry.installs) {
      // If the user disabled the skill after install, the writer moved the
      // entire skill dir into a sibling `.disabled/<name>/` folder. Try both
      // paths so removal cleans up either state and we don't leave dangling
      // symlinks pointing at a bundle clone we're about to delete.
      const candidates = [inst.symlinkPath, disabledVariantOf(inst.symlinkPath)];
      let removed = false;
      let lastMessage: string | undefined;
      for (const candidate of candidates) {
        const r = await removeSymlink(candidate, allowedRoots);
        if (r.ok && r.message !== "already gone") {
          stdout.push(`  - ${candidate}`);
          await appendAudit(input.homeDir, {
            ts: new Date().toISOString(),
            op: "remove",
            name: entry.name,
            toolId: inst.toolId,
            skillName: inst.skillName,
            outcome: "ok"
          });
          // Best-effort: drop the now-empty parent skill dir so we don't leave
          // litter under .claude/skills/ or .claude/skills/.disabled/.
          await fs.rmdir(path.dirname(candidate)).catch(() => undefined);
          removed = true;
          break;
        }
        if (!r.ok) lastMessage = r.message;
      }
      if (!removed) {
        if (lastMessage) {
          stdout.push(`  ! ${inst.symlinkPath}: ${lastMessage}`);
          await appendAudit(input.homeDir, {
            ts: new Date().toISOString(),
            op: "remove",
            name: entry.name,
            toolId: inst.toolId,
            skillName: inst.skillName,
            outcome: "error",
            message: lastMessage
          });
        } else {
          // Both candidates returned "already gone" — nothing to do, log as ok.
          await appendAudit(input.homeDir, {
            ts: new Date().toISOString(),
            op: "remove",
            name: entry.name,
            toolId: inst.toolId,
            skillName: inst.skillName,
            outcome: "ok",
            message: "already gone"
          });
        }
      }
    }

    const bundleDir = path.join(input.homeDir, ".ankui", "bundles", ...entry.name.split("/"));
    if (!input.flags.keepClone) {
      await fs.rm(bundleDir, { recursive: true, force: true });
    }

    reg.bundles.splice(idx, 1);
    await writeRegistry(input.homeDir, reg);

    await appendAudit(input.homeDir, {
      ts: new Date().toISOString(),
      op: "remove",
      name: entry.name,
      outcome: "ok"
    });
    stdout.push(`✓ Removed ${entry.name}`);
    return 0;
  });

  return { exitCode, stdout, stderr };
}

/**
 * Maps `.../skills/<name>/SKILL.md` → `.../skills/.disabled/<name>/SKILL.md`.
 * Mirrors the rename the writer performs when a user disables a skill, so
 * remove can clean up the post-disable location as well as the original.
 */
function disabledVariantOf(symlinkPath: string): string {
  const skillFile = path.basename(symlinkPath);
  const skillDir = path.dirname(symlinkPath);
  const skillName = path.basename(skillDir);
  const parentDir = path.dirname(skillDir);
  return path.join(parentDir, ".disabled", skillName, skillFile);
}
