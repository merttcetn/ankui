import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readJsonFile, readMarkdownFile } from "../parsing.js";
import { safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildLinkDetails,
  buildSkill,
  createAdapterState,
  createMcpDetails,
  extractFirstHeading,
  extractMcpEntries,
  firstString,
  isDiscovered,
  parseMarkdownFrontmatter,
  readRecord,
  safeReadOptions,
  scanMarkdownSkillTree,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

const TOOL_ID = "antigravity" as const;

export const antigravityAdapter: ScannerAdapter = {
  toolId: TOOL_ID,
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();

    const ideDir = path.join(context.homeDir, ".antigravity");
    const cliNewDir = path.join(context.homeDir, ".gemini", "antigravity-cli");
    const cliOldDir = path.join(context.homeDir, ".gemini", "antigravity");

    await scanIdeSkills(state, context, ideDir);
    await scanSettingsMcp(state, context, cliNewDir);
    await scanLegacyMcp(state, context, cliOldDir);
    await scanPlugins(state, context, cliNewDir);
    await scanProjectMemory(state, context);

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanIdeSkills(
  state: AdapterState,
  context: AdapterContext,
  ideDir: string
): Promise<void> {
  if (!isDiscovered(context, ideDir)) {
    return;
  }

  const tree = await scanMarkdownSkillTree({
    parent: path.join(ideDir, "skills"),
    context,
    toolId: TOOL_ID,
    kind: "agent_skill",
    scope: "user"
  });
  addWarningsToState(state, tree.warnings);

  for (const skill of [...tree.active, ...tree.disabled]) {
    addSkillToState(state, skill);
  }
}

async function scanSettingsMcp(
  state: AdapterState,
  context: AdapterContext,
  cliNewDir: string
): Promise<void> {
  if (!isDiscovered(context, cliNewDir)) {
    return;
  }

  const settingsPath = path.join(cliNewDir, "settings.json");
  const result = await readJsonFile(settingsPath, safeReadOptions(settingsPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: TOOL_ID,
        kind: "mcp_server",
        name: entry.name,
        summary: "Antigravity CLI MCP server from settings.json.",
        scope: "user",
        sourcePath: settingsPath,
        source: "config",
        details: createMcpDetails(entry)
      })
    );
  }
}

async function scanLegacyMcp(
  state: AdapterState,
  context: AdapterContext,
  cliOldDir: string
): Promise<void> {
  if (!isDiscovered(context, cliOldDir)) {
    return;
  }

  const mcpPath = path.join(cliOldDir, "mcp_config.json");
  const result = await readJsonFile(mcpPath, safeReadOptions(mcpPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: TOOL_ID,
        kind: "mcp_server",
        name: entry.name,
        summary: "Antigravity legacy MCP server from mcp_config.json.",
        scope: "user",
        sourcePath: mcpPath,
        source: "config",
        details: createMcpDetails(entry)
      })
    );
  }
}

async function scanPlugins(
  state: AdapterState,
  context: AdapterContext,
  cliNewDir: string
): Promise<void> {
  if (!isDiscovered(context, cliNewDir)) {
    return;
  }

  const pluginsDir = path.join(cliNewDir, "plugins");
  const entries = await safeReadDirectory(pluginsDir, safeReadOptions(pluginsDir, context));
  addWarningsToState(state, entries.warnings);

  if (!entries.ok) {
    return;
  }

  for (const entry of entries.value) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const pluginDir = path.join(pluginsDir, entry.name);
    await scanPluginManifest(state, context, pluginDir, entry.name);
    await scanPluginMcp(state, context, pluginDir, entry.name);
    await scanPluginSkills(state, context, pluginDir, entry.name);
  }
}

async function scanPluginManifest(
  state: AdapterState,
  context: AdapterContext,
  pluginDir: string,
  pluginName: string
): Promise<void> {
  const manifestPath = path.join(pluginDir, "plugin.json");
  const result = await readJsonFile(manifestPath, safeReadOptions(manifestPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  const config = readRecord(result.value);
  const name = firstString(config?.name) ?? pluginName;
  const summary =
    firstString(config?.description) ?? `Antigravity plugin from ${pluginName}.`;

  addSkillToState(
    state,
    buildSkill({
      toolId: TOOL_ID,
      kind: "plugins",
      name,
      summary,
      scope: "user",
      sourcePath: manifestPath,
      source: "config",
      details: {
        pluginName,
        version: firstString(config?.version)
      }
    })
  );
}

async function scanPluginMcp(
  state: AdapterState,
  context: AdapterContext,
  pluginDir: string,
  pluginName: string
): Promise<void> {
  const mcpPath = path.join(pluginDir, "mcp_config.json");
  const result = await readJsonFile(mcpPath, safeReadOptions(mcpPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  for (const entry of extractMcpEntries(result.value)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: TOOL_ID,
        kind: "mcp_server",
        name: entry.name,
        summary: `Antigravity plugin MCP server from ${pluginName}/mcp_config.json.`,
        scope: "user",
        sourcePath: mcpPath,
        source: "config",
        details: {
          ...createMcpDetails(entry),
          pluginName
        }
      })
    );
  }
}

async function scanPluginSkills(
  state: AdapterState,
  context: AdapterContext,
  pluginDir: string,
  pluginName: string
): Promise<void> {
  const skillsDir = path.join(pluginDir, "skills");
  const tree = await scanMarkdownSkillTree({
    parent: skillsDir,
    context,
    toolId: TOOL_ID,
    kind: "agent_skill",
    scope: "user"
  });
  addWarningsToState(state, tree.warnings);

  for (const skill of [...tree.active, ...tree.disabled]) {
    addSkillToState(state, {
      ...skill,
      details: { ...(skill.details ?? {}), pluginName }
    });
  }
}

async function scanProjectMemory(
  state: AdapterState,
  context: AdapterContext
): Promise<void> {
  const filePath = path.join(context.cwd, "AGENTS.md");

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
      toolId: TOOL_ID,
      kind: "memory_file",
      name:
        firstString(frontmatter.metadata.name) ??
        extractFirstHeading(result.value) ??
        path.basename(filePath),
      summary: firstString(frontmatter.metadata.description) ?? "Antigravity memory file.",
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
