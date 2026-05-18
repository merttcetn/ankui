import fs from "node:fs/promises";
import path from "node:path";

import { isPathInside } from "../scanner/paths.js";

export type RenameSafetyFailureReason =
  | "source_missing"
  | "target_exists"
  | "outside_allowed_roots";

export type RenameSafetyResult =
  | { ok: true }
  | { ok: false; reason: RenameSafetyFailureReason; message: string };

export interface CheckRenameSafetyOptions {
  source: string;
  target: string;
  /** Roots the rename must stay inside. Both source and target are checked. */
  allowedRoots: string[];
}

export async function checkRenameSafety(
  options: CheckRenameSafetyOptions
): Promise<RenameSafetyResult> {
  const source = path.resolve(options.source);
  const target = path.resolve(options.target);
  const allowedRoots = options.allowedRoots.map((r) => path.resolve(r));

  const insideAny = (p: string): boolean =>
    allowedRoots.some((root) => isPathInside(p, root));

  if (!insideAny(source) || !insideAny(target)) {
    return {
      ok: false,
      reason: "outside_allowed_roots",
      message: `rename target outside allowed roots: ${source} -> ${target}`
    };
  }

  try {
    await fs.stat(source);
  } catch {
    return {
      ok: false,
      reason: "source_missing",
      message: `rename source does not exist: ${source}`
    };
  }

  try {
    await fs.stat(target);
    return {
      ok: false,
      reason: "target_exists",
      message: `rename target already exists (no clobber): ${target}`
    };
  } catch {
    return { ok: true };
  }
}
