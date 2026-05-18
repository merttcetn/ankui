import path from "node:path";

import { type Scope, type SkillKind, type SkillSource } from "../../types.js";
import { readJsonFile } from "../parsing.js";
import { maskSecretText, safeReadDirectory } from "../safety.js";
import {
  addSkillToState,
  addWarningsToState,
  buildMarkdownSkill,
  collectMarkdownFiles,
  createAdapterState,
  createMcpDetails,
  extractMcpEntries,
  firstString,
  hasMeaningfulValue,
  isDiscovered,
  isRecord,
  readRecord,
  safeReadOptions,
  buildSkill,
  type AdapterState
} from "./shared.js";
import type { AdapterContext, AdapterResult, ScannerAdapter } from "./index.js";

type ClaudeState = AdapterState;

interface ScopedPath {
  path: string;
  scope: Scope;
  requiredPath?: string;
}

export const claudeAdapter: ScannerAdapter = {
  toolId: "claude",
  async scan(context: AdapterContext): Promise<AdapterResult> {
    const state = createAdapterState();

    await scanJsonConfigFiles(state, context);
    await scanMemoryFiles(state, context);
    await scanMarkdownDirectories(state, context, "agents", "custom_agents");
    await scanMarkdownDirectories(state, context, "commands", "custom_commands");
    await scanSkillDirectories(state, context);

    return {
      skills: state.skills,
      warnings: state.warnings
    };
  }
};

async function scanJsonConfigFiles(state: ClaudeState, context: AdapterContext): Promise<void> {
  const userClaudeDir = path.join(context.homeDir, ".claude");
  const projectClaudeDir = path.join(context.cwd, ".claude");

  for (const configFile of [
    {
      path: path.join(userClaudeDir, "settings.json"),
      scope: "user" as const,
      settings: true,
      requiredPath: userClaudeDir
    },
    {
      path: path.join(projectClaudeDir, "settings.json"),
      scope: "project" as const,
      settings: true,
      requiredPath: path.join(projectClaudeDir, "settings.json")
    },
    {
      path: path.join(projectClaudeDir, "settings.local.json"),
      scope: "project" as const,
      settings: true,
      requiredPath: path.join(projectClaudeDir, "settings.local.json")
    },
    {
      path: path.join(context.homeDir, ".claude.json"),
      scope: "user" as const,
      settings: false,
      requiredPath: path.join(context.homeDir, ".claude.json")
    },
    {
      path: path.join(context.cwd, ".mcp.json"),
      scope: "project" as const,
      settings: false,
      requiredPath: path.join(context.cwd, ".mcp.json")
    }
  ]) {
    if (!isDiscovered(context, configFile.requiredPath)) {
      continue;
    }

    const result = await readJsonFile(configFile.path, safeReadOptions(configFile.path, context));
    addWarningsToState(state, result.warnings);

    if (!result.ok) {
      continue;
    }

    for (const entry of extractMcpEntries(result.value)) {
      addSkillToState(
        state,
        buildSkill({
          toolId: "claude",
          kind: "mcp_server",
          name: entry.name,
          summary: `Claude MCP server from ${path.basename(configFile.path)}.`,
          scope: configFile.scope,
          sourcePath: configFile.path,
          source: "config",
          details: createMcpDetails(entry)
        })
      );
    }

    if (configFile.settings) {
      addSettingsSkills(state, result.value, configFile);
    }
  }
}

async function scanMemoryFiles(state: ClaudeState, context: AdapterContext): Promise<void> {
  const userClaudeDir = path.join(context.homeDir, ".claude");
  const projectClaudeDir = path.join(context.cwd, ".claude");
  const candidates: ScopedPath[] = [
    { path: path.join(userClaudeDir, "CLAUDE.md"), scope: "user", requiredPath: userClaudeDir },
    {
      path: path.join(context.cwd, "CLAUDE.md"),
      scope: "project",
      requiredPath: path.join(context.cwd, "CLAUDE.md")
    },
    {
      path: path.join(projectClaudeDir, "CLAUDE.md"),
      scope: "project",
      requiredPath: projectClaudeDir
    },
    {
      path: path.join(context.cwd, "CLAUDE.local.md"),
      scope: "project",
      requiredPath: path.join(context.cwd, "CLAUDE.local.md")
    }
  ];

  for (const candidate of candidates) {
    if (!isDiscovered(context, candidate.requiredPath)) {
      continue;
    }

    await scanMarkdownBackedSkill(state, context, {
      filePath: candidate.path,
      scope: candidate.scope,
      kind: "memory_file",
      source: "directory",
      fallbackName: path.basename(candidate.path),
      summaryFallback: "Claude memory file.",
      warnOnMissing: false
    });
  }
}

async function scanMarkdownDirectories(
  state: ClaudeState,
  context: AdapterContext,
  directoryName: "agents" | "commands",
  kind: "custom_agents" | "custom_commands"
): Promise<void> {
  const directories: ScopedPath[] = [
    {
      path: path.join(context.homeDir, ".claude", directoryName),
      scope: "user",
      requiredPath: path.join(context.homeDir, ".claude")
    },
    {
      path: path.join(context.cwd, ".claude", directoryName),
      scope: "project",
      requiredPath: path.join(context.cwd, ".claude")
    }
  ];

  for (const directory of directories) {
    if (!isDiscovered(context, directory.requiredPath)) {
      continue;
    }

    const files = await collectMarkdownFiles(directory.path, state, context);

    for (const filePath of files) {
      const fallbackName = path
        .relative(directory.path, filePath)
        .replace(/\.md$/i, "")
        .split(path.sep)
        .join("/");

      await scanMarkdownBackedSkill(state, context, {
        filePath,
        scope: directory.scope,
        kind,
        source: "directory",
        fallbackName,
        summaryFallback:
          kind === "custom_agents" ? "Claude custom agent." : "Claude custom command.",
        warnOnMissing: true
      });
    }
  }
}

async function scanSkillDirectories(state: ClaudeState, context: AdapterContext): Promise<void> {
  const directories: ScopedPath[] = [
    {
      path: path.join(context.homeDir, ".claude", "skills"),
      scope: "user",
      requiredPath: path.join(context.homeDir, ".claude")
    },
    {
      path: path.join(context.cwd, ".claude", "skills"),
      scope: "project",
      requiredPath: path.join(context.cwd, ".claude")
    }
  ];

  for (const directory of directories) {
    if (!isDiscovered(context, directory.requiredPath)) {
      continue;
    }

    const entries = await safeReadDirectory(directory.path, safeReadOptions(directory.path, context));
    addWarningsToState(state, entries.warnings);

    if (!entries.ok) {
      continue;
    }

    for (const entry of entries.value) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const skillPath = path.join(directory.path, entry.name, "SKILL.md");

      await scanMarkdownBackedSkill(state, context, {
        filePath: skillPath,
        scope: directory.scope,
        kind: "agent_skill",
        source: "directory",
        fallbackName: entry.name,
        summaryFallback: "Claude agent skill.",
        warnOnMissing: false
      });
    }
  }
}

async function scanMarkdownBackedSkill(
  state: ClaudeState,
  context: AdapterContext,
  options: {
    filePath: string;
    scope: Scope;
    kind: SkillKind;
    source: SkillSource;
    fallbackName: string;
    summaryFallback: string;
    warnOnMissing: boolean;
  }
): Promise<void> {
  const built = await buildMarkdownSkill(context, {
    filePath: options.filePath,
    toolId: "claude",
    kind: options.kind,
    scope: options.scope,
    source: options.source,
    fallbackName: options.fallbackName,
    summaryFallback: options.summaryFallback,
    warnOnMissing: options.warnOnMissing
  });
  addWarningsToState(state, built.warnings);

  if (built.skill) {
    addSkillToState(state, built.skill);
  }
}

function addSettingsSkills(
  state: ClaudeState,
  settings: unknown,
  configFile: { path: string; scope: Scope }
): void {
  if (!isRecord(settings)) {
    return;
  }

  const permissions = settings.permissions;

  if (hasMeaningfulValue(permissions)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "claude",
        kind: "rules",
        name: `${scopeLabel(configFile.scope)} Claude permissions`,
        summary: `Claude permissions from ${path.basename(configFile.path)}.`,
        scope: configFile.scope,
        sourcePath: configFile.path,
        source: "config",
        details: {
          configPath: "permissions",
          keys: isRecord(permissions) ? Object.keys(permissions).sort() : undefined
        }
      })
    );
  }

  for (const plugin of extractPluginEntries(settings)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "claude",
        kind: "plugins",
        name: plugin.name,
        summary: `Claude plugin entry from ${path.basename(configFile.path)}.`,
        scope: configFile.scope,
        sourcePath: configFile.path,
        source: "config",
        details: {
          configPath: plugin.configPath
        }
      })
    );
  }

  const hooks = settings.hooks;

  if (hasMeaningfulValue(hooks)) {
    addSkillToState(
      state,
      buildSkill({
        toolId: "claude",
        kind: "rules",
        name: `${scopeLabel(configFile.scope)} Claude hooks`,
        summary: `Claude hook settings from ${path.basename(configFile.path)}.`,
        scope: configFile.scope,
        sourcePath: configFile.path,
        source: "config",
        details: {
          configPath: "hooks",
          keys: isRecord(hooks) ? Object.keys(hooks).sort() : undefined
        }
      })
    );
  }
}

function extractPluginEntries(
  value: Record<string, unknown>
): Array<{ name: string; configPath: string }> {
  const pluginEntries: Array<{ name: string; configPath: string }> = [];

  for (const key of ["plugins", "plugin", "enabledPlugins"]) {
    const candidate = value[key];

    if (Array.isArray(candidate)) {
      for (const [index, entry] of candidate.entries()) {
        const name = typeof entry === "string" ? entry : firstString(readRecord(entry)?.name);

        if (name) {
          pluginEntries.push({ name, configPath: `${key}.${index}` });
        }
      }
      continue;
    }

    if (isRecord(candidate)) {
      for (const pluginName of Object.keys(candidate)) {
        pluginEntries.push({
          name: maskSecretText(pluginName),
          configPath: `${key}.${pluginName}`
        });
      }
    }
  }

  return pluginEntries;
}

function scopeLabel(scope: Scope): string {
  return scope === "user" ? "User" : "Project";
}
