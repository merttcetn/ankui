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
    const allowedRoots = [input.homeDir, input.cwd];

    for (const inst of entry.installs) {
      const r = await removeSymlink(inst.symlinkPath, allowedRoots);
      if (!r.ok) {
        stdout.push(`  ! ${inst.symlinkPath}: ${r.message}`);
        await appendAudit(input.homeDir, {
          ts: new Date().toISOString(),
          op: "remove",
          name: entry.name,
          toolId: inst.toolId,
          skillName: inst.skillName,
          outcome: "error",
          message: r.message
        });
      } else {
        stdout.push(`  - ${inst.symlinkPath}`);
        await appendAudit(input.homeDir, {
          ts: new Date().toISOString(),
          op: "remove",
          name: entry.name,
          toolId: inst.toolId,
          skillName: inst.skillName,
          outcome: "ok"
        });
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
