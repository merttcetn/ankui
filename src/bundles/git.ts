import { spawn } from "node:child_process";

export interface CloneOptions {
  url: string;
  target: string;
  /** 0 = full clone; >0 = --depth=N */
  depth: number;
}

export async function gitClone(opts: CloneOptions): Promise<void> {
  const args = ["clone"];
  if (opts.depth > 0) args.push(`--depth=${opts.depth}`);
  args.push("--quiet", opts.url, opts.target);
  await run("git", args, undefined, "git clone failed");
}

export async function gitFetch(repoDir: string): Promise<void> {
  await run("git", ["fetch", "--quiet", "origin"], repoDir, "git fetch failed");
}

export async function gitFetchUnshallow(repoDir: string): Promise<void> {
  // Defensive: swallow "already complete" errors so we can run this idempotently.
  try {
    await run("git", ["fetch", "--unshallow", "--quiet", "origin"], repoDir, "git fetch --unshallow failed");
  } catch (e) {
    const msg = (e as Error).message;
    if (/unshallow on a complete repository/i.test(msg) || /does not make sense/i.test(msg)) {
      return;
    }
    throw e;
  }
}

export async function gitCheckout(repoDir: string, ref: string): Promise<void> {
  await run("git", ["checkout", "--quiet", ref], repoDir, "git checkout failed");
}

export async function gitRevParse(repoDir: string, ref: string): Promise<string> {
  const { stdout } = await runCapture("git", ["rev-parse", ref], repoDir, "git rev-parse failed");
  return stdout.trim();
}

export async function gitLogSubject(repoDir: string, ref: string): Promise<string> {
  const { stdout } = await runCapture("git", ["log", "-1", "--format=%s", ref], repoDir, "git log failed");
  return stdout.trim();
}

export interface NameStatusDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export async function gitDiffNameStatus(
  repoDir: string,
  oldRef: string,
  newRef: string
): Promise<NameStatusDiff> {
  const { stdout } = await runCapture(
    "git",
    ["diff", "--name-status", oldRef, newRef],
    repoDir,
    "git diff failed"
  );
  const out: NameStatusDiff = { added: [], removed: [], modified: [] };
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [status, ...rest] = line.split("\t");
    const file = rest.join("\t");
    if (status === "A") out.added.push(file);
    else if (status === "D") out.removed.push(file);
    else if (status === "M") out.modified.push(file);
    // R (rename) treated as remove+add by callers if needed
  }
  return out;
}

function run(cmd: string, args: string[], cwd: string | undefined, errPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr?.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${errPrefix} (exit ${code}): ${stderr.trim().slice(0, 200)}`));
    });
    p.on("error", (e) => reject(new Error(`${errPrefix}: ${e.message}`)));
  });
}

function runCapture(
  cmd: string,
  args: string[],
  cwd: string | undefined,
  errPrefix: string
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    p.stderr?.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    p.on("exit", (code) => {
      if (code === 0) resolve({ stdout });
      else reject(new Error(`${errPrefix} (exit ${code}): ${stderr.trim().slice(0, 200)}`));
    });
    p.on("error", (e) => reject(new Error(`${errPrefix}: ${e.message}`)));
  });
}
