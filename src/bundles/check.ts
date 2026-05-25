import path from "node:path";
import { readRegistry } from "./registry.js";
import { gitFetch, gitRevParse, gitDiffNameStatus, gitFetchUnshallow } from "./git.js";

export type CheckResult =
  | { status: "not_found" }
  | { status: "up_to_date"; pinnedSha: string }
  | {
      status: "ahead";
      pinnedSha: string;
      latestSha: string;
      count: number;
      changes: { added: string[]; removed: string[]; modified: string[] };
    };

export async function checkBundleUpdate(opts: { name: string; homeDir: string }): Promise<CheckResult> {
  const reg = await readRegistry(opts.homeDir);
  const entry = reg.bundles.find((b) => b.name === opts.name);
  if (!entry) return { status: "not_found" };
  const bundleDir = path.join(opts.homeDir, ".ankui", "bundles", ...entry.name.split("/"));
  await gitFetchUnshallow(bundleDir);
  await gitFetch(bundleDir);
  let latestSha: string;
  try {
    latestSha = await gitRevParse(bundleDir, "origin/HEAD");
  } catch {
    latestSha = await gitRevParse(bundleDir, "FETCH_HEAD").catch(() => entry.pinnedSha);
  }
  if (latestSha === entry.pinnedSha) {
    return { status: "up_to_date", pinnedSha: entry.pinnedSha };
  }
  const diff = await gitDiffNameStatus(bundleDir, entry.pinnedSha, latestSha);
  return {
    status: "ahead",
    pinnedSha: entry.pinnedSha,
    latestSha,
    count: diff.added.length + diff.removed.length + diff.modified.length,
    changes: diff
  };
}
