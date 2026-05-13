import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readJsonFile, readMarkdownFile } from "../parsing.js";
import { safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildLinkDetails,
  buildSkill,
  collectMarkdownFiles,
  createAdapterState,
  createMcpDetails,
  extractFirstHeading,
  extractMcpEntries,
  firstString,
  isDiscovered,
  parseMarkdownFrontmatter,
  readRecord,
  safeReadOptions,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

export const geminiAdapter: ScannerAdapter = {
  toolId: "gemini",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();
    const userGeminiDir = path.join(context.homeDir, ".gemini");
    const projectGeminiDir = path.join(context.cwd, ".gemini");

    await scanSettingsJson(state, context, path.join(userGeminiDir, "settings.json"), "user", userGeminiDir);
    await scanCommandDirectory(state, context, path.join(userGeminiDir, "commands"), "user", userGeminiDir);
    await scanCommandDirectory(state, context, path.join(projectGeminiDir, "commands"), "project", projectGeminiDir);
    await scanSkillDirectory(state, context, path.join(userGeminiDir, "skills"), "user", userGeminiDir);
    await scanSkillDirectory(state, context, path.join(projectGeminiDir, "skills"), "project", projectGeminiDir);
    await scanExtensions(state, context, path.join(userGeminiDir, "extensions"), "user", userGeminiDir);
    await scanMemoryFile(state, context, path.join(context.cwd, "GEMINI.md"));

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanSettingsJson(
  state: AdapterState,
  context: AdapterContext,
  settingsPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const result = await readJsonFile(settingsPath, safeReadOptions(settingsPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "gemini",
        kind: "mcp_server",
        name: entry.name,
        summary: `Gemini MCP server from ${path.basename(settingsPath)}.`,
        scope,
        sourcePath: settingsPath,
        source: "config",
        details: createMcpDetails(entry)
      })
    );
  }
}

async function scanCommandDirectory(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const files = await collectMarkdownFiles(dirPath, state, context);

  for (const filePath of files) {
    const fallbackName = path
      .relative(dirPath, filePath)
      .replace(/\.md$/i, "")
      .split(path.sep)
      .join("/");

    const result = await readMarkdownFile(filePath, safeReadOptions(filePath, context));
    addWarningsToState(state, result.warnings);

    if (!result.ok) {
      continue;
    }

    const frontmatter = parseMarkdownFrontmatter(result.value, filePath);
    addWarningsToState(state, frontmatter.warnings);

    const name =
      firstString(frontmatter.metadata.name, frontmatter.metadata.title) ?? fallbackName;
    const summary =
      firstString(frontmatter.metadata.description, frontmatter.metadata.summary) ??
      extractFirstHeading(result.value) ??
      "Gemini custom command.";

    const linkDetails = await buildLinkDetails(filePath, context);

    addSkillToState(
      state,
      buildSkill({
        toolId: "gemini",
        kind: "custom_commands",
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
  }
}

async function scanSkillDirectory(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
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

    const skillPath = path.join(dirPath, entry.name, "SKILL.md");
    const result = await readMarkdownFile(skillPath, safeReadOptions(skillPath, context));
    addWarningsToState(state, result.warnings);

    if (!result.ok) {
      continue;
    }

    const frontmatter = parseMarkdownFrontmatter(result.value, skillPath);
    addWarningsToState(state, frontmatter.warnings);

    const name =
      firstString(frontmatter.metadata.name, frontmatter.metadata.title) ?? entry.name;
    const summary =
      firstString(frontmatter.metadata.description, frontmatter.metadata.summary) ??
      extractFirstHeading(result.value) ??
      "Gemini agent skill.";

    const linkDetails = await buildLinkDetails(skillPath, context);

    addSkillToState(
      state,
      buildSkill({
        toolId: "gemini",
        kind: "agent_skill",
        name,
        summary,
        scope,
        sourcePath: skillPath,
        source: "directory",
        details: {
          preview: createSanitizedPreview(result.value, skillPath),
          lineCount: countTextLines(result.value),
          ...linkDetails
        }
      })
    );
  }
}

async function scanExtensions(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
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

    const extensionJsonPath = path.join(dirPath, entry.name, "gemini-extension.json");
    const result = await readJsonFile(extensionJsonPath, safeReadOptions(extensionJsonPath, context));
    addWarningsToState(state, result.warnings);

    if (!result.ok) {
      continue;
    }

    const config = readRecord(result.value);
    const name = firstString(config?.name) ?? entry.name;
    const summary =
      firstString(config?.description) ?? `Gemini extension from ${entry.name}.`;

    addSkillToState(
      state,
      buildSkill({
        toolId: "gemini",
        kind: "plugins",
        name,
        summary,
        scope,
        sourcePath: extensionJsonPath,
        source: "config",
        details: {
          configPath: entry.name,
          version: firstString(config?.version)
        }
      })
    );
  }
}

async function scanMemoryFile(
  state: AdapterState,
  context: AdapterContext,
  filePath: string
): Promise<void> {
  if (!isDiscovered(context, filePath)) {
    return;
  }

  const result = await readMarkdownFile(filePath, safeReadOptions(filePath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  const frontmatter = parseMarkdownFrontmatter(result.value, filePath);
  addWarningsToState(state, frontmatter.warnings);

  const linkDetails = await buildLinkDetails(filePath, context);

  addSkillToState(
    state,
    buildSkill({
      toolId: "gemini",
      kind: "memory_file",
      name:
        firstString(frontmatter.metadata.name) ??
        extractFirstHeading(result.value) ??
        path.basename(filePath),
      summary: firstString(frontmatter.metadata.description) ?? "Gemini memory file.",
      scope: "project",
      sourcePath: filePath,
      source: "directory",
      details: {
        preview: createSanitizedPreview(result.value, filePath),
        lineCount: countTextLines(result.value),
        ...linkDetails
      }
    })
  );
}
