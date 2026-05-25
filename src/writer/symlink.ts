import fs from "node:fs/promises";
import path from "node:path";

export interface SymlinkResult {
  ok: boolean;
  message?: string;
  rollback?: () => Promise<void>;
}

export interface InstallSymlinkOptions {
  source: string;
  target: string;
  /** Both source and target must resolve under at least one of these roots. */
  allowedRoots: string[];
}

export async function installSymlink(opts: InstallSymlinkOptions): Promise<SymlinkResult> {
  const sourceAbs = path.resolve(opts.source);
  const targetAbs = path.resolve(opts.target);

  if (!isUnderAny(sourceAbs, opts.allowedRoots)) {
    return { ok: false, message: `source outside allowed roots: ${opts.source}` };
  }
  if (!isUnderAny(targetAbs, opts.allowedRoots)) {
    return { ok: false, message: `target outside allowed roots: ${opts.target}` };
  }

  try {
    await fs.lstat(targetAbs);
    return { ok: false, message: `target exists: ${opts.target}` };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, message: `lstat failed: ${(e as Error).message}` };
    }
  }

  await fs.mkdir(path.dirname(targetAbs), { recursive: true });
  await fs.symlink(sourceAbs, targetAbs);

  return {
    ok: true,
    rollback: async () => {
      try {
        const stat = await fs.lstat(targetAbs);
        if (stat.isSymbolicLink()) await fs.unlink(targetAbs);
      } catch {
        // already gone — idempotent
      }
    }
  };
}

export async function removeSymlink(target: string, allowedRoots: string[]): Promise<SymlinkResult> {
  const targetAbs = path.resolve(target);
  if (!isUnderAny(targetAbs, allowedRoots)) {
    return { ok: false, message: `target outside allowed roots: ${target}` };
  }
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.lstat(targetAbs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, message: "already gone" };
    }
    return { ok: false, message: `lstat failed: ${(e as Error).message}` };
  }
  if (!stat.isSymbolicLink()) {
    return { ok: false, message: `not a symlink (user took ownership?): ${target}` };
  }
  await fs.unlink(targetAbs);
  return { ok: true };
}

function isUnderAny(p: string, roots: string[]): boolean {
  for (const r of roots) {
    const rr = path.resolve(r);
    if (p === rr) return true;
    if (p.startsWith(rr + path.sep)) return true;
  }
  return false;
}
