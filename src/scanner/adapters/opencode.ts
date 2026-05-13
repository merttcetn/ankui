import path from "node:path";

import { countTextLines, createSanitizedPreview } from "../preview.js";
import { readJsoncFile, readMarkdownFile } from "../parsing.js";
import { maskSecretText, safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildLinkDetails,
  buildSkill,
  collectMarkdownFiles,
  createAdapterState,
  extractFirstHeading,
  firstString,
  isDiscovered,
  parseMarkdownFrontmatter,
  readMaskedUrl,
  readRecord,
  safeReadOptions,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

const OPENCODE_EXCLUDED_DIRS = new Set([
  "sessions",
  "session",
  "cache",
  "auth",
  "log",
  "logs",
  "history",
  "histories",
  "share",
  "database",
  "databases",
  "db",
  "runtime"
]);

export const opencodeAdapter: ScannerAdapter = {
  toolId: "opencode",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();
    const userOpenCodeDir = path.join(context.homeDir, ".config", "opencode");
    const projectOpenCodeDir = path.join(context.cwd, ".opencode");

    for (const configFile of [
      {
        path: path.join(context.cwd, "opencode.json"),
        scope: "project" as const,
        requiredPath: path.join(context.cwd, "opencode.json")
      },
      {
        path: path.join(context.cwd, "opencode.jsonc"),
        scope: "project" as const,
        requiredPath: path.join(context.cwd, "opencode.jsonc")
      }
    ]) {
      await scanJsoncConfig(state, context, configFile.path, configFile.scope, configFile.requiredPath);
    }

    await scanMarkdownDirectory(state, context, path.join(userOpenCodeDir, "agent"), "user", "custom_agents", userOpenCodeDir);
    await scanMarkdownDirectory(state, context, path.join(projectOpenCodeDir, "agent"), "project", "custom_agents", projectOpenCodeDir);
    await scanMarkdownDirectory(state, context, path.join(userOpenCodeDir, "command"), "user", "custom_commands", userOpenCodeDir);
    await scanMarkdownDirectory(state, context, path.join(projectOpenCodeDir, "command"), "project", "custom_commands", projectOpenCodeDir);
    await scanMarkdownDirectory(state, context, path.join(userOpenCodeDir, "tools"), "user", "custom_tools", userOpenCodeDir);
    await scanMarkdownDirectory(state, context, path.join(projectOpenCodeDir, "tools"), "project", "custom_tools", projectOpenCodeDir);
    await scanSkillDirectories(state, context, path.join(userOpenCodeDir, "skills"), "user", userOpenCodeDir);
    await scanSkillDirectories(state, context, path.join(projectOpenCodeDir, "skills"), "project", projectOpenCodeDir);
    await scanMemoryFile(state, context, path.join(context.cwd, "AGENTS.md"), "project");

    return { skills: state.skills, warnings: state.warnings };
  }
};

async function scanJsoncConfig(
  state: AdapterState,
  context: AdapterContext,
  configPath: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const result = await readJsoncFile(configPath, safeReadOptions(configPath, context));
  addWarningsToState(state, result.warnings);

  if (!result.ok) {
    return;
  }

  const config = readRecord(result.value);

  if (!config) {
    return;
  }

  // OpenCode uses key "mcp" directly mapping { serverName: serverConfig }
  const mcp = readRecord(config.mcp);

  if (mcp) {
    for (const [serverName, serverConfig] of Object.entries(mcp)) {
      if (serverName.trim().length === 0) {
        continue;
      }

      const cfg = readRecord(serverConfig);
      addSkillToState(
        state,
        buildSkill({
          toolId: "opencode",
          kind: "mcp_server",
          name: maskSecretText(serverName),
          summary: `OpenCode MCP server from ${path.basename(configPath)}.`,
          scope,
          sourcePath: configPath,
          source: "config",
          details: {
            configPath: `mcp.${serverName}`,
            command: cfg ? firstString(cfg.command) : undefined,
            args: cfg && Array.isArray(cfg.args)
              ? (cfg.args as unknown[])
                  .filter((a): a is string => typeof a === "string")
                  .map((a) => readMaskedUrl(a) ?? a)
              : undefined,
            envKeys: cfg && readRecord(cfg.env)
              ? Object.keys(readRecord(cfg.env) ?? {}).sort()
              : undefined
          }
        })
      );
    }
  }

  // Plugins
  const plugins = config.plugins;

  if (Array.isArray(plugins)) {
    for (const [index, entry] of plugins.entries()) {
      const name = typeof entry === "string" ? maskSecretText(entry) : undefined;

      if (name) {
        addSkillToState(
          state,
          buildSkill({
            toolId: "opencode",
            kind: "plugins",
            name,
            summary: `OpenCode plugin from ${path.basename(configPath)}.`,
            scope,
            sourcePath: configPath,
            source: "config",
            details: { configPath: `plugins.${index}` }
          })
        );
      }
    }
  }

  // Tools permissions → single rules skill listing enabled tool keys
  const tools = readRecord(config.tools);

  if (tools && Object.keys(tools).length > 0) {
    const enabledKeys = Object.entries(tools)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort();

    addSkillToState(
      state,
      buildSkill({
        toolId: "opencode",
        kind: "rules",
        name: `${scope === "user" ? "User" : "Project"} OpenCode tools`,
        summary: `OpenCode tool permissions from ${path.basename(configPath)}.`,
        scope,
        sourcePath: configPath,
        source: "config",
        details: { configPath: "tools", keys: enabledKeys }
      })
    );
  }

  // Local instruction file references — skip remote URLs
  const instructions = config.instructions;

  if (Array.isArray(instructions)) {
    for (const entry of instructions) {
      if (typeof entry !== "string") {
        continue;
      }

      const trimmed = entry.trim();

      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        continue;
      }

      const absPath = path.resolve(context.cwd, trimmed);
      await scanMemoryFile(state, context, absPath, scope);
    }
  }
}

async function scanMarkdownDirectory(
  state: AdapterState,
  context: AdapterContext,
  dirPath: string,
  scope: "user" | "project",
  kind: "custom_agents" | "custom_commands" | "custom_tools",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const files = await collectMarkdownFiles(dirPath, state, context);

  for (const filePath of files) {
    if (isExcludedOpenCodePath(filePath)) {
      continue;
    }

    const fallbackName = path
      .relative(dirPath, filePath)
      .replace(/\.md$/i, "")
      .split(path.sep)
      .join("/");

    await scanMarkdownSkill(state, context, { filePath, scope, kind, fallbackName });
  }
}

async function scanSkillDirectories(
  state: AdapterState,
  context: AdapterContext,
  skillsDir: string,
  scope: "user" | "project",
  requiredPath: string
): Promise<void> {
  if (!isDiscovered(context, requiredPath)) {
    return;
  }

  const entries = await safeReadDirectory(skillsDir, safeReadOptions(skillsDir, context));
  addWarningsToState(state, entries.warnings);

  if (!entries.ok) {
    return;
  }

  for (const entry of entries.value) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || OPENCODE_EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    await scanMarkdownSkill(state, context, {
      filePath: skillPath,
      scope,
      kind: "agent_skill",
      fallbackName: entry.name
    });
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
    fallbackName: path.basename(filePath)
  });
}

async function scanMarkdownSkill(
  state: AdapterState,
  context: AdapterContext,
  options: {
    filePath: string;
    scope: "user" | "project";
    kind: "custom_agents" | "custom_commands" | "agent_skill" | "custom_tools" | "memory_file";
    fallbackName: string;
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
    "OpenCode skill.";

  const linkDetails = await buildLinkDetails(options.filePath, context);

  addSkillToState(
    state,
    buildSkill({
      toolId: "opencode",
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

function isExcludedOpenCodePath(filePath: string): boolean {
  return filePath.split(path.sep).some((segment) => OPENCODE_EXCLUDED_DIRS.has(segment));
}
