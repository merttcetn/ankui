import fs from "node:fs/promises";
import path from "node:path";

import type { Skill } from "../types.js";
import {
  checkRenameSafety,
  type RenameSafetyFailureReason
} from "./safety.js";

export interface WriterContext {
  homeDir: string;
  cwd: string;
}

export type SkillWriterResult =
  | { ok: true; newSourcePath: string }
  | { ok: false; reason: RenameSafetyFailureReason; message: string };

export async function disableSkill(
  skill: Skill,
  context: WriterContext
): Promise<SkillWriterResult> {
  const skillDir = path.dirname(skill.sourcePath);
  const parentDir = path.dirname(skillDir);
  const targetDir = path.join(parentDir, ".disabled", path.basename(skillDir));

  return performRename(skillDir, targetDir, context);
}

export async function enableSkill(
  skill: Skill,
  context: WriterContext
): Promise<SkillWriterResult> {
  const skillDir = path.dirname(skill.sourcePath);
  const disabledParentDir = path.dirname(skillDir);
  const skillsParentDir = path.dirname(disabledParentDir);
  const targetDir = path.join(skillsParentDir, path.basename(skillDir));

  return performRename(skillDir, targetDir, context);
}

async function performRename(
  sourceDir: string,
  targetDir: string,
  context: WriterContext
): Promise<SkillWriterResult> {
  const safety = await checkRenameSafety({
    source: sourceDir,
    target: targetDir,
    allowedRoots: [context.homeDir, context.cwd]
  });

  if (!safety.ok) {
    return { ok: false, reason: safety.reason, message: safety.message };
  }

  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.rename(sourceDir, targetDir);

  return { ok: true, newSourcePath: path.join(targetDir, "SKILL.md") };
}
