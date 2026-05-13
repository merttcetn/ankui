import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readMarkdownFile } from "../parsing.js";
import { safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildLinkDetails,
  buildSkill,
  createAdapterState,
  extractFirstHeading,
  firstString,
  isDiscovered,
  parseMarkdownFrontmatter,
  safeReadOptions,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

export const skillsShAdapter: ScannerAdapter = {
  toolId: "skills-sh",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();
    const userSkillsDirs = [
      path.join(context.homeDir, ".skills"),
      path.join(context.homeDir, ".config", "skills")
    ];
    const projectSkillsDir = path.join(context.cwd, ".skills");

    for (const dir of userSkillsDirs) {
      await scanSkillsDirectory(state, context, dir, "user");
    }

    await scanSkillsDirectory(state, context, projectSkillsDir, "project");

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanSkillsDirectory(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project"
): Promise<void> {
  if (!isDiscovered(context, dirPath)) {
    return;
  }

  const entries = await safeReadDirectory(dirPath, safeReadOptions(dirPath, context));
  addWarningsToState(state, entries.warnings);

  if (!entries.ok) {
    return;
  }

  for (const entry of entries.value) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    await scanSkillEntry(state, context, path.join(dirPath, entry.name), entry.name, scope);
  }
}

async function scanSkillEntry(
  state: AdapterState,
  context: AdapterContext,
  skillDir: string,
  fallbackName: string,
  scope: "user" | "project"
): Promise<void> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const readmePath = path.join(skillDir, "README.md");

  for (const filePath of [skillMdPath, readmePath]) {
    const result = await readMarkdownFile(filePath, safeReadOptions(filePath, context));

    if (!result.ok) {
      continue;
    }

    const frontmatter = parseMarkdownFrontmatter(result.value, filePath);
    addWarningsToState(state, frontmatter.warnings);

    const name =
      firstString(frontmatter.metadata.name, frontmatter.metadata.title) ??
      extractFirstHeading(result.value) ??
      fallbackName;
    const summary =
      firstString(frontmatter.metadata.description, frontmatter.metadata.summary) ??
      "skills.sh skill.";

    const linkDetails = await buildLinkDetails(filePath, context);

    addSkillToState(
      state,
      buildSkill({
        toolId: "skills-sh",
        kind: "skills_sh_skill",
        name,
        summary,
        scope,
        sourcePath: filePath,
        source: "directory",
        details: {
          preview: createSanitizedPreview(result.value, filePath),
          lineCount: countTextLines(result.value),
          ...linkDetails
        }
      })
    );

    return; // stop after first found file (SKILL.md preferred over README.md)
  }
}
