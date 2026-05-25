import fs from "node:fs/promises";
import path from "node:path";

import { readRegistry, writeRegistry, withRegistryLock, type BundleInstall } from "../bundles/registry.js";
import { appendAudit } from "../bundles/audit.js";
import { gitLogSubject, gitCheckout } from "../bundles/git.js";
import { findBundleSkills } from "../bundles/scan-bundle.js";
import { buildPlan, type PlannedInstall } from "../bundles/install.js";
import { installSymlink, removeSymlink } from "../writer/symlink.js";
import { checkBundleUpdate } from "../bundles/check.js";
import type { CommandResult } from "./add.js";

export interface UpdateCommandInput {
  name: string;
  flags: { yes?: boolean; force?: boolean; skipConflicts?: boolean };
  homeDir: string;
  cwd: string;
}

export async function runUpdateCommand(input: UpdateCommandInput): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const reg = await readRegistry(input.homeDir);
  const entry = reg.bundles.find((b) => b.name === input.name);
  if (!entry) {
    stderr.push(`bundle not found: ${input.name}`);
    return { exitCode: 1, stdout, stderr };
  }
  const bundleDir = path.join(input.homeDir, ".ankui", "bundles", ...entry.name.split("/"));

  let check: Awaited<ReturnType<typeof checkBundleUpdate>>;
  try {
    check = await checkBundleUpdate({ name: input.name, homeDir: input.homeDir });
  } catch (e) {
    stderr.push((e as Error).message);
    return { exitCode: 1, stdout, stderr };
  }

  if (check.status === "not_found") {
    stderr.push(`bundle not found: ${input.name}`);
    return { exitCode: 1, stdout, stderr };
  }
  if (check.status === "up_to_date") {
    stdout.push(`${entry.name} is up to date at ${entry.pinnedSha.slice(0, 7)}.`);
    return { exitCode: 0, stdout, stderr };
  }

  const latestSha = check.latestSha;
  const previousSha = entry.pinnedSha;
  const newSubj = await gitLogSubject(bundleDir, latestSha);

  // Project-scope bundles record the cwd they were installed from. Honor that
  // when planning so an update run from elsewhere (or from the web server,
  // which passes homeDir as cwd) doesn't install into the wrong project.
  const projectScope = entry.scope === "project";
  const targetCwd = projectScope ? (entry.projectCwd ?? input.cwd) : input.cwd;
  const allowedRoots = [input.homeDir, targetCwd];

  // Checkout the new SHA so we can scan the post-update skill set. The
  // rollback closure resets the working tree to `previousSha` on any early
  // return; otherwise an aborted update would leave bundle contents at
  // latestSha while the registry still says previousSha, silently swapping
  // installed skills under the user's feet.
  await gitCheckout(bundleDir, latestSha);
  let checkedOutNew = true;
  const rollbackCheckout = async (): Promise<void> => {
    if (!checkedOutNew) return;
    try {
      await gitCheckout(bundleDir, previousSha);
    } catch {
      /* breadcrumb only — audit will surface the broken state if this happens */
    }
    checkedOutNew = false;
  };

  try {
    const newSkills = await findBundleSkills(bundleDir);
    // Diff the actual skill sets pre/post checkout. This is robust to root-level
    // SKILL.md changes (which the git diff parser used to miss) and to renames
    // collapsed by git into add+remove of the parent dir.
    const oldNames = new Set(entry.installs.map((i) => i.skillName));
    const newNames = new Set(newSkills.map((s) => s.skillName));
    const addedSkills = [...newNames].filter((n) => !oldNames.has(n));
    const removedSkills = [...oldNames].filter((n) => !newNames.has(n));

    stdout.push(`Current: ${previousSha.slice(0, 7)} "${entry.pinnedCommitMessage}"`);
    stdout.push(`Latest:  ${latestSha.slice(0, 7)} "${newSubj}"`);
    if (addedSkills.length) stdout.push(`  + ${addedSkills.join(", ")}`);
    if (removedSkills.length) stdout.push(`  - ${removedSkills.join(", ")}`);

    const tools = Array.from(new Set(entry.installs.map((i) => i.toolId)));
    const plan = await buildPlan({
      skills: newSkills.filter((s) => addedSkills.includes(s.skillName)),
      tools,
      scope: entry.scope,
      homeDir: input.homeDir,
      cwd: targetCwd
    });

    if (plan.conflicts.length > 0 && !input.flags.force && !input.flags.skipConflicts) {
      stderr.push(`Update aborted — ${plan.conflicts.length} conflict(s) on added skills.`);
      await rollbackCheckout();
      await appendAudit(input.homeDir, {
        ts: new Date().toISOString(),
        op: "update",
        name: entry.name,
        outcome: "refused",
        message: `conflicts on added skills (${plan.conflicts.length})`
      });
      return { exitCode: 1, stdout, stderr };
    }

    // --force: conflicting added skills aren't in plan.installs (buildPlan
    // routes them to plan.conflicts), so we pre-clear the existing target and
    // queue a synthetic install. Two passes on purpose: pass 1 just lstats and
    // collects unresolvable conflicts (directories, EPERM, etc.). If any are
    // unresolvable, we abort BEFORE touching disk, so --force never half-clears
    // a set and then silently advances the SHA — that was exactly the bug
    // where a directory-shaped conflict got skipped but `✓ Updated` still ran.
    const forcedInstalls: PlannedInstall[] = [];
    if (input.flags.force && plan.conflicts.length > 0) {
      const skillByName = new Map(newSkills.map((s) => [s.skillName, s] as const));

      const unresolvable: Array<{ path: string; reason: string }> = [];
      for (const c of plan.conflicts) {
        if (!skillByName.has(c.skillName)) continue;
        try {
          const st = await fs.lstat(c.symlinkPath);
          if (st.isDirectory() && !st.isSymbolicLink()) {
            unresolvable.push({ path: c.symlinkPath, reason: "refusing to overwrite directory" });
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            unresolvable.push({ path: c.symlinkPath, reason: (err as Error).message });
          }
        }
      }

      if (unresolvable.length > 0) {
        for (const u of unresolvable) {
          stderr.push(`  ! ${u.path}: ${u.reason}`);
        }
        stderr.push(`Update aborted — ${unresolvable.length} forced conflict(s) could not be cleared. No changes applied.`);
        await rollbackCheckout();
        await appendAudit(input.homeDir, {
          ts: new Date().toISOString(),
          op: "update",
          name: entry.name,
          outcome: "error",
          message: `unresolvable forced conflicts (${unresolvable.length})`
        });
        return { exitCode: 1, stdout, stderr };
      }

      for (const c of plan.conflicts) {
        const skill = skillByName.get(c.skillName);
        if (!skill) continue;
        try {
          await fs.unlink(c.symlinkPath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            // Raced with another writer between pass 1 and pass 2.
            stderr.push(`  ! ${c.symlinkPath}: ${(err as Error).message}`);
            stderr.push(`Update aborted — conflict cleanup raced.`);
            await rollbackCheckout();
            await appendAudit(input.homeDir, {
              ts: new Date().toISOString(),
              op: "update",
              name: entry.name,
              outcome: "error",
              message: `conflict cleanup raced at ${c.symlinkPath}`
            });
            return { exitCode: 1, stdout, stderr };
          }
        }
        forcedInstalls.push({
          toolId: c.toolId,
          skillName: c.skillName,
          source: skill.skillMdPath,
          symlinkPath: c.symlinkPath
        });
      }
    }
    const installsToApply: PlannedInstall[] = [...plan.installs, ...forcedInstalls];

    const rollbacks: Array<() => Promise<void>> = [];
    const newInstalls: BundleInstall[] = [];
    try {
      for (const it of installsToApply) {
        const r = await installSymlink({ source: it.source, target: it.symlinkPath, allowedRoots });
        if (!r.ok) {
          throw new Error(`failed to install ${it.symlinkPath}: ${r.message}`);
        }
        if (r.rollback) rollbacks.push(r.rollback);
        newInstalls.push({ toolId: it.toolId, skillName: it.skillName, bundlePath: it.source, symlinkPath: it.symlinkPath });
      }
    } catch (installErr) {
      for (const rb of rollbacks.reverse()) {
        try { await rb(); } catch { /* swallow */ }
      }
      await rollbackCheckout();
      const msg = (installErr as Error).message;
      stderr.push(msg);
      await appendAudit(input.homeDir, {
        ts: new Date().toISOString(),
        op: "update",
        name: entry.name,
        outcome: "error",
        message: msg
      });
      return { exitCode: 1, stdout, stderr };
    }

    for (const inst of entry.installs.filter((i) => removedSkills.includes(i.skillName))) {
      const r = await removeSymlink(inst.symlinkPath, allowedRoots);
      if (!r.ok) stdout.push(`  ! ${inst.symlinkPath}: ${r.message}`);
    }

    const retained = entry.installs.filter((i) => !removedSkills.includes(i.skillName));
    entry.installs = [...retained, ...newInstalls];
    entry.pinnedSha = latestSha;
    entry.pinnedCommitMessage = newSubj;
    entry.updatedAt = new Date().toISOString();

    await withRegistryLock(input.homeDir, async () => {
      const cur = await readRegistry(input.homeDir);
      const idx = cur.bundles.findIndex((b) => b.name === entry.name);
      if (idx >= 0) cur.bundles[idx] = entry;
      await writeRegistry(input.homeDir, cur);
    });

    // Committed: working tree is canonical at latestSha, no rollback needed.
    checkedOutNew = false;

    await appendAudit(input.homeDir, { ts: new Date().toISOString(), op: "update", name: entry.name, sha: latestSha, outcome: "ok" });
    stdout.push(`✓ Updated ${entry.name} → ${latestSha.slice(0, 7)}`);
    return { exitCode: 0, stdout, stderr };
  } catch (e) {
    await rollbackCheckout();
    const msg = (e as Error).message;
    stderr.push(msg);
    await appendAudit(input.homeDir, {
      ts: new Date().toISOString(),
      op: "update",
      name: entry.name,
      outcome: "error",
      message: msg
    });
    return { exitCode: 1, stdout, stderr };
  }
}
