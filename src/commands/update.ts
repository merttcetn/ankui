import path from "node:path";

import { readRegistry, writeRegistry, withRegistryLock, type BundleInstall } from "../bundles/registry.js";
import { appendAudit } from "../bundles/audit.js";
import { gitLogSubject, gitCheckout } from "../bundles/git.js";
import { findBundleSkills } from "../bundles/scan-bundle.js";
import { buildPlan } from "../bundles/install.js";
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
  const diff = check.changes;
  const addedSkills = uniqueSkillsFromPaths(diff.added);
  const removedSkills = uniqueSkillsFromPaths(diff.removed);

  const newSubj = await gitLogSubject(bundleDir, latestSha);
  stdout.push(`Current: ${entry.pinnedSha.slice(0, 7)} "${entry.pinnedCommitMessage}"`);
  stdout.push(`Latest:  ${latestSha.slice(0, 7)} "${newSubj}"`);
  if (addedSkills.length) stdout.push(`  + ${addedSkills.join(", ")}`);
  if (removedSkills.length) stdout.push(`  - ${removedSkills.join(", ")}`);

  await gitCheckout(bundleDir, latestSha);

  const newSkills = await findBundleSkills(bundleDir);
  const tools = Array.from(new Set(entry.installs.map((i) => i.toolId)));
  const plan = await buildPlan({
    skills: newSkills.filter((s) => addedSkills.includes(s.skillName)),
    tools,
    scope: entry.scope,
    homeDir: input.homeDir,
    cwd: input.cwd
  });

  if (plan.conflicts.length > 0 && !input.flags.force && !input.flags.skipConflicts) {
    stderr.push(`Update aborted — ${plan.conflicts.length} conflict(s) on added skills.`);
    return { exitCode: 1, stdout, stderr };
  }

  const allowedRoots = [input.homeDir, input.cwd];
  const newInstalls: BundleInstall[] = [];
  for (const it of plan.installs) {
    const r = await installSymlink({ source: it.source, target: it.symlinkPath, allowedRoots });
    if (!r.ok) {
      stderr.push(`failed to install ${it.symlinkPath}: ${r.message}`);
      return { exitCode: 1, stdout, stderr };
    }
    newInstalls.push({ toolId: it.toolId, skillName: it.skillName, bundlePath: it.source, symlinkPath: it.symlinkPath });
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

  await appendAudit(input.homeDir, { ts: new Date().toISOString(), op: "update", name: entry.name, sha: latestSha, outcome: "ok" });
  stdout.push(`✓ Updated ${entry.name} → ${latestSha.slice(0, 7)}`);
  return { exitCode: 0, stdout, stderr };
}

function uniqueSkillsFromPaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (!p.endsWith("/SKILL.md")) continue;
    const parts = p.split("/");
    out.add(parts[parts.length - 2]);
  }
  return Array.from(out);
}
