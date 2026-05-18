import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readMarkdownFile, readTomlFile } from "../parsing.js";
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
  safeReadOptions,
  scanMarkdownSkillTree,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

export const codexAdapter: ScannerAdapter = {
  toolId: "codex",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();
    const userCodexDir = path.join(context.homeDir, ".codex");
    const projectCodexDir = path.join(context.cwd, ".codex");

    await scanTomlConfig(state, context, path.join(userCodexDir, "config.toml"), "user", userCodexDir);
    await scanTomlConfig(state, context, path.join(projectCodexDir, "config.toml"), "project", projectCodexDir);
    await scanPromptDirectory(state, context, path.join(userCodexDir, "prompts"), "user", userCodexDir);
    await scanPromptDirectory(state, context, path.join(projectCodexDir, "prompts"), "project", projectCodexDir);
    await scanSkillDirectory(state, context, path.join(userCodexDir, "skills"), "user", userCodexDir);
    await scanSkillDirectory(state, context, path.join(projectCodexDir, "skills"), "project", projectCodexDir);
    await scanRulesDirectory(state, context, path.join(userCodexDir, "rules"), "user", userCodexDir);
    await scanMemoryFile(state, context, path.join(context.cwd, "AGENTS.md"), "project");

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanTomlConfig(
  state: AdapterState,
  context: AdapterContext,
  configPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const result = await readTomlFile(configPath, safeReadOptions(configPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "codex",
        kind: "mcp_server",
        name: entry.name,
        summary: `Codex MCP server from ${path.basename(configPath)}.`,
        scope,
        sourcePath: configPath,
        source: "config",
        details: createMcpDetails(entry)
      })
    );
  }
}

async function scanPromptDirectory(
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

    await scanMarkdownSkill(state, context, {
      filePath,
      scope,
      kind: "custom_prompts",
      fallbackName,
      summaryFallback: "Codex custom prompt."
    });
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

  const tree = await scanMarkdownSkillTree({
    parent: dirPath,
    context,
    toolId: "codex",
    kind: "agent_skill",
    scope
  });
  addWarningsToState(state, tree.warnings);

  for (const s of [...tree.active, ...tree.disabled]) {
    addSkillToState(state, s);
  }
}

async function scanRulesDirectory(
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
    if (!entry.isFile() || !entry.name.endsWith(".rules")) {
      continue;
    }

    addSkillToState(
      state,
      buildSkill({
        toolId: "codex",
        kind: "rules",
        name: entry.name.replace(/\.rules$/, ""),
        summary: `Codex permission rules from ${entry.name}.`,
        scope,
        sourcePath: path.join(dirPath, entry.name),
        source: "config"
      })
    );
  }
}

async function scanMemoryFile(
  state: AdapterState,
  context: AdapterContext,
  filePath: string,
  scope: "user" | "project"
): Promise<void> {
  if (!isDiscovered(context, filePath)) {
    return;
  }

  await scanMarkdownSkill(state, context, {
    filePath,
    scope,
    kind: "memory_file",
    fallbackName: path.basename(filePath),
    summaryFallback: "Codex memory file."
  });
}

async function scanMarkdownSkill(
  state: AdapterState,
  context: AdapterContext,
  options: {
    filePath: string;
    scope: "user" | "project";
    kind: "custom_prompts" | "memory_file" | "agent_skill";
    fallbackName: string;
    summaryFallback: string;
  }
): Promise<void> {
  const result = await readMarkdownFile(options.filePath, safeReadOptions(options.filePath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  const frontmatter = parseMarkdownFrontmatter(result.value, options.filePath);
  addWarningsToState(state, frontmatter.warnings);

  const name =
    firstString(frontmatter.metadata.name, frontmatter.metadata.title) ?? options.fallbackName;
  const summary =
    firstString(frontmatter.metadata.description, frontmatter.metadata.summary) ??
    extractFirstHeading(result.value) ??
    options.summaryFallback;

  const linkDetails = await buildLinkDetails(options.filePath, context);

  addSkillToState(
    state,
    buildSkill({
      toolId: "codex",
      kind: options.kind,
      name,
      summary,
      scope: options.scope,
      sourcePath: options.filePath,
      source: "directory",
      details: {
        preview: createSanitizedPreview(result.value, options.filePath),
        lineCount: countTextLines(result.value),
        ...linkDetails
      }
    })
  );
}
