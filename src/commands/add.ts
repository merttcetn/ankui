import fs from "node:fs/promises";
import path from "node:path";

import { parseGitHubUrl } from "../bundles/url.js";
import { readRegistry, writeRegistry, withRegistryLock, type BundleEntry, type BundleInstall } from "../bundles/registry.js";
import { appendAudit } from "../bundles/audit.js";
import { gitClone, gitRevParse, gitLogSubject } from "../bundles/git.js";
import { findBundleSkills } from "../bundles/scan-bundle.js";
import { buildPlan, detectInstalledTools, type PlannedInstall } from "../bundles/install.js";
import { installSymlink } from "../writer/symlink.js";
import { hasSensitivePathSegment } from "../scanner/safety.js";
import type { ToolId } from "../types.js";

const DEFAULT_MAX_SIZE_MB = 50;

export interface AddCommandInput {
  urlOrPath: string;
  flags: {
    claude?: boolean;
    skillsSh?: boolean;
    all?: boolean;
    project?: boolean;
    force?: boolean;
    skipConflicts?: boolean;
    yes?: boolean;
    maxSizeMb?: number;
    /** Test seam — allows file:// or absolute paths in unit tests. Off in production. */
    allowFileUrl?: boolean;
  };
  homeDir: string;
  cwd: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export async function runAddCommand(input: AddCommandInput): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  // 1. URL parse
  let name: string;
  let canonicalUrl: string;
  if (input.flags.allowFileUrl && (input.urlOrPath.startsWith("/") || input.urlOrPath.startsWith("file://"))) {
    // Test seam: derive a synthetic name from the path basename
    const norm = input.urlOrPath.replace(/^file:\/\//, "");
    const repo = path.basename(norm);
    name = `local/${repo}`;
    canonicalUrl = `file://${norm}`;
  } else {
    try {
      const parsed = parseGitHubUrl(input.urlOrPath);
      name = parsed.name;
      canonicalUrl = parsed.url;
    } catch (e) {
      stderr.push((e as Error).message);
      return { exitCode: 1, stdout, stderr };
    }
  }

  // 2. Registry check
  const before = await readRegistry(input.homeDir);
  if (before.bundles.some((b) => b.url === canonicalUrl || b.name === name)) {
    stderr.push(`${name} is already installed. Use 'ankui update ${name}' to refresh, or 'ankui remove ${name}' first to reinstall.`);
    await appendAudit(input.homeDir, { ts: new Date().toISOString(), op: "add", url: canonicalUrl, name, outcome: "refused", message: "already installed" });
    return { exitCode: 1, stdout, stderr };
  }

  // 3. Shallow clone
  const bundleDir = path.join(input.homeDir, ".ankui", "bundles", ...name.split("/"));
  try {
    await fs.mkdir(path.dirname(bundleDir), { recursive: true });
    await gitClone({ url: canonicalUrl.replace(/^file:\/\//, ""), target: bundleDir, depth: 1 });
  } catch (e) {
    stderr.push((e as Error).message);
    await fs.rm(bundleDir, { recursive: true, force: true });
    await appendAudit(input.homeDir, { ts: new Date().toISOString(), op: "add", url: canonicalUrl, name, outcome: "error", message: (e as Error).message });
    return { exitCode: 1, stdout, stderr };
  }

  try {
    // 4. Size guardrail
    const maxBytes = (input.flags.maxSizeMb ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
    const totalBytes = await dirSize(bundleDir);
    if (totalBytes > maxBytes) {
      throw new Error(`bundle exceeds size cap: ${Math.round(totalBytes / 1024 / 1024)} MB > ${input.flags.maxSizeMb ?? DEFAULT_MAX_SIZE_MB} MB`);
    }

    // 5. SHA + commit message
    const sha = await gitRevParse(bundleDir, "HEAD");
    const commitSubject = await gitLogSubject(bundleDir, "HEAD");

    // 6. Sensitive-file scan
    if (await hasTopLevelSensitiveFile(bundleDir)) {
      throw new Error(`bundle contains a sensitive file at top level; refusing install`);
    }

    // 7. Bundle scan
    const skills = await findBundleSkills(bundleDir);
    if (skills.length === 0) {
      throw new Error(`no SKILL.md files found in bundle`);
    }

    // 8. Scope determination
    const scope: "user" | "project" = input.flags.project ? "project" : "user";

    // 9. Target tools
    const installed = await detectInstalledTools(input.homeDir);
    const tools = resolveTargetTools(input.flags, installed);
    if (tools.length === 0) {
      throw new Error(`no applicable tools detected on this machine`);
    }

    // 10. Plan + conflict detection
    const plan = await buildPlan({ skills, tools, scope, homeDir: input.homeDir, cwd: input.cwd });

    // 11. Conflict gate
    if (plan.conflicts.length > 0 && !input.flags.force && !input.flags.skipConflicts) {
      stderr.push(`Found ${plan.conflicts.length} conflict(s):`);
      for (const c of plan.conflicts) {
        const tag = c.source === "your_file" ? "your file" : "from another bundle";
        stderr.push(`  ${c.symlinkPath} (${tag})`);
      }
      stderr.push(`Resolve: rm the file, 'ankui remove <other-bundle>', or rerun with --force or --skip-conflicts.`);
      throw new Error("aborted due to conflicts");
    }

    const finalInstalls = input.flags.skipConflicts ? plan.installs : plan.installs;
    // skipConflicts already drops conflicting items at planning time; non-conflicting set proceeds.

    // 13. Execute installs with rollback on mid-flight failure
    const rollbacks: Array<() => Promise<void>> = [];
    const allowedRoots = [input.homeDir, input.cwd];
    const successes: PlannedInstall[] = [];
    try {
      for (const it of finalInstalls) {
        const r = await installSymlink({ source: it.source, target: it.symlinkPath, allowedRoots });
        if (!r.ok) {
          throw new Error(`installSymlink failed for ${it.symlinkPath}: ${r.message}`);
        }
        if (r.rollback) rollbacks.push(r.rollback);
        successes.push(it);
      }
    } catch (e) {
      for (const rb of rollbacks.reverse()) {
        try { await rb(); } catch { /* swallow; audit log carries the breadcrumb */ }
      }
      throw e;
    }

    // 14. Registry update under lock
    const installs: BundleInstall[] = successes.map((s) => ({
      toolId: s.toolId,
      skillName: s.skillName,
      bundlePath: s.source,
      symlinkPath: s.symlinkPath
    }));
    const now = new Date().toISOString();
    const entry: BundleEntry = {
      name,
      url: canonicalUrl,
      pinnedSha: sha,
      pinnedCommitMessage: commitSubject,
      installedAt: now,
      updatedAt: now,
      scope,
      projectCwd: scope === "project" ? input.cwd : undefined,
      installs
    };

    await withRegistryLock(input.homeDir, async () => {
      const reg = await readRegistry(input.homeDir);
      reg.bundles.push(entry);
      await writeRegistry(input.homeDir, reg);
    });

    // 15. Audit
    await appendAudit(input.homeDir, { ts: now, op: "add", url: canonicalUrl, name, sha, outcome: "ok" });
    for (const inst of installs) {
      await appendAudit(input.homeDir, { ts: now, op: "add", name, toolId: inst.toolId, skillName: inst.skillName, outcome: "ok" });
    }

    // 16. Summary
    stdout.push(`✓ Cloned ${name} (pinned ${sha.slice(0, 7)} "${commitSubject}")`);
    stdout.push(`✓ Installed ${installs.length} symlinks across ${tools.length} tool(s)`);
    stdout.push(`  Registry: ${path.join(input.homeDir, ".ankui", "bundles", "registry.json")}`);
    stdout.push(`  To remove: ankui remove ${name}`);
    return { exitCode: 0, stdout, stderr };

  } catch (e) {
    // cleanup partial clone
    await fs.rm(bundleDir, { recursive: true, force: true });
    const msg = (e as Error).message;
    stderr.push(msg);
    await appendAudit(input.homeDir, { ts: new Date().toISOString(), op: "add", url: canonicalUrl, name, outcome: "error", message: msg });
    return { exitCode: 1, stdout, stderr };
  }
}

function resolveTargetTools(flags: AddCommandInput["flags"], installed: ToolId[]): ToolId[] {
  if (flags.claude && !flags.skillsSh) return installed.includes("claude") ? ["claude"] : [];
  if (flags.skillsSh && !flags.claude) return installed.includes("skills-sh") ? ["skills-sh"] : [];
  // --all or no flag → all installed that accept SKILL.md
  return installed.filter((t) => t === "claude" || t === "skills-sh");
}

async function hasTopLevelSensitiveFile(bundleDir: string): Promise<boolean> {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === ".git") continue;
    if (hasSensitivePathSegment(path.join(bundleDir, e.name))) return true;
  }
  return false;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) {
        const st = await fs.stat(abs);
        total += st.size;
      }
    }
  }
  return total;
}
