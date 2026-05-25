import fs from "node:fs/promises";
import path from "node:path";

import type { ToolId } from "../types.js";
import type { BundleSkill } from "./scan-bundle.js";

export interface PlanInput {
  skills: BundleSkill[];
  tools: ToolId[];
  scope: "user" | "project";
  homeDir: string;
  cwd: string;
}

export interface PlannedInstall {
  toolId: ToolId;
  skillName: string;
  source: string;
  symlinkPath: string;
}

export interface PlannedConflict {
  toolId: ToolId;
  skillName: string;
  symlinkPath: string;
  source: "your_file" | "other_bundle";
}

export interface Plan {
  installs: PlannedInstall[];
  conflicts: PlannedConflict[];
}

const TOOL_DIRS: Partial<Record<ToolId, string>> = {
  claude: ".claude/skills",
  "skills-sh": ".skills"
};

export async function buildPlan(input: PlanInput): Promise<Plan> {
  const root = input.scope === "project" ? input.cwd : input.homeDir;
  const ankuiBundlesPrefix = path.join(input.homeDir, ".ankui", "bundles") + path.sep;
  const installs: PlannedInstall[] = [];
  const conflicts: PlannedConflict[] = [];

  for (const skill of input.skills) {
    for (const tool of input.tools) {
      const toolDir = TOOL_DIRS[tool];
      if (!toolDir) continue;
      const symlinkPath = path.join(root, toolDir, skill.skillName, "SKILL.md");

      let conflictSource: "your_file" | "other_bundle" | null = null;
      try {
        const stat = await fs.lstat(symlinkPath);
        if (stat.isSymbolicLink()) {
          const linkTarget = await fs.readlink(symlinkPath);
          const resolved = path.resolve(path.dirname(symlinkPath), linkTarget);
          conflictSource = resolved.startsWith(ankuiBundlesPrefix) ? "other_bundle" : "your_file";
        } else {
          conflictSource = "your_file";
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          conflictSource = "your_file";
        }
      }

      if (conflictSource) {
        conflicts.push({ toolId: tool, skillName: skill.skillName, symlinkPath, source: conflictSource });
      } else {
        installs.push({ toolId: tool, skillName: skill.skillName, source: skill.skillMdPath, symlinkPath });
      }
    }
  }

  return { installs, conflicts };
}

export function detectInstalledTools(homeDir: string): Promise<ToolId[]> {
  // Returns ToolIds whose user-scope config dir exists.
  return Promise.all([
    fs.access(path.join(homeDir, ".claude")).then(() => "claude" as ToolId).catch(() => null),
    Promise.any([
      fs.access(path.join(homeDir, ".skills")),
      fs.access(path.join(homeDir, ".config", "skills"))
    ]).then(() => "skills-sh" as ToolId).catch(() => null)
  ]).then((arr) => arr.filter((x): x is ToolId => x !== null));
}
