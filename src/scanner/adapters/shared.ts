import path from "node:path";

import {
  createSkillId,
  createWarning,
  type Scope,
  type Skill,
  type SkillKind,
  type SkillSource,
  type ToolId,
  type Warning
} from "../../types.js";
import { isPathInside, toDisplayPath } from "../paths.js";
import { parseYamlText } from "../parsing.js";
import { getLinkInfo, maskSecretText, maskUrl, safeReadDirectory } from "../safety.js";
import type { AdapterContext } from "./index.js";

// ─── State ───────────────────────────────────────────────────────────────────

export interface AdapterState {
  skills: Skill[];
  warnings: Warning[];
  skillIds: Set<string>;
  warningIds: Set<string>;
}

export function createAdapterState(): AdapterState {
  return { skills: [], warnings: [], skillIds: new Set(), warningIds: new Set() };
}

export function addSkillToState(state: AdapterState, skill: Skill): void {
  if (state.skillIds.has(skill.id)) {
    return;
  }

  state.skillIds.add(skill.id);
  state.skills.push(skill);
}

export function addWarningsToState(state: AdapterState, warnings: readonly Warning[]): void {
  for (const w of warnings) {
    if (state.warningIds.has(w.id)) {
      continue;
    }

    state.warningIds.add(w.id);
    state.warnings.push(w);
  }
}

// ─── Skill factory ────────────────────────────────────────────────────────────

export function buildSkill(input: {
  toolId: ToolId;
  kind: SkillKind;
  name: string;
  summary: string;
  scope: Scope;
  sourcePath: string;
  source: SkillSource;
  details?: Record<string, unknown>;
}): Skill {
  return {
    id: createSkillId({
      toolId: input.toolId,
      kind: input.kind,
      name: input.name,
      sourcePath: input.sourcePath
    }),
    toolId: input.toolId,
    kind: input.kind,
    name: normalizeSummary(input.name),
    summary: normalizeSummary(input.summary),
    scope: input.scope,
    sourcePath: input.sourcePath,
    source: input.source,
    capabilityCategories: ["unknown"],
    accessLevel: "unknown",
    details: input.details
  };
}

// ─── MCP extraction ───────────────────────────────────────────────────────────

export interface McpEntry {
  name: string;
  configPath: string;
  config: unknown;
}

export function extractMcpEntries(value: unknown): McpEntry[] {
  const entries: McpEntry[] = [];

  visitConfigValue(value, [], (key, candidate, configPath) => {
    if (!isMcpServersKey(key) || !isRecord(candidate)) {
      return;
    }

    for (const [serverName, serverConfig] of Object.entries(candidate)) {
      if (serverName.trim().length === 0) {
        continue;
      }

      entries.push({
        name: maskSecretText(serverName),
        config: serverConfig,
        configPath: [...configPath, serverName].join(".")
      });
    }
  });

  return entries;
}

export function createMcpDetails(entry: McpEntry): Record<string, unknown> {
  const config = readRecord(entry.config);

  if (!config) {
    return { configPath: entry.configPath };
  }

  return {
    configPath: entry.configPath,
    command: readMaskedString(config.command),
    args: readMaskedUrlArray(config.args),
    url: readMaskedUrl(config.url) ?? readMaskedUrl(config.serverUrl),
    type: readMaskedString(config.type),
    transport: readMaskedString(config.transport),
    disabled: typeof config.disabled === "boolean" ? config.disabled : undefined,
    envKeys: readRecord(config.env)
      ? Object.keys(readRecord(config.env) ?? {}).sort()
      : undefined
  };
}

function visitConfigValue(
  value: unknown,
  configPath: string[],
  visitor: (key: string, value: unknown, configPath: string[]) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      visitConfigValue(item, [...configPath, String(index)], visitor)
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    const entryPath = [...configPath, key];
    visitor(key, entryValue, entryPath);

    if (!isMcpServersKey(key)) {
      visitConfigValue(entryValue, entryPath, visitor);
    }
  }
}

function isMcpServersKey(key: string): boolean {
  return key === "mcpServers" || key === "mcp_servers";
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}

// ─── Masked readers ───────────────────────────────────────────────────────────

export function readMaskedString(value: unknown): string | undefined {
  return typeof value === "string" ? maskSecretText(value) : undefined;
}

export function readMaskedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((e): e is string => typeof e === "string").map(maskSecretText);
}

export function readMaskedUrl(value: unknown): string | undefined {
  return typeof value === "string" ? maskUrl(value) : undefined;
}

export function readMaskedUrlArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((e): e is string => typeof e === "string").map(maskUrl);
}

// ─── String utils ─────────────────────────────────────────────────────────────

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return maskSecretText(value.trim());
    }
  }

  return undefined;
}

export function normalizeSummary(summary: string): string {
  return summary.replace(/\s+/g, " ").trim();
}

// ─── Markdown utils ───────────────────────────────────────────────────────────

export interface MarkdownFrontmatter {
  metadata: Record<string, unknown>;
  warnings: Warning[];
}

export function parseMarkdownFrontmatter(
  text: string,
  sourcePath: string
): MarkdownFrontmatter {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!normalizedText.startsWith("---\n")) {
    return { metadata: {}, warnings: [] };
  }

  const closingMatch = /^---\s*$/m.exec(normalizedText.slice(4));

  if (!closingMatch) {
    return {
      metadata: {},
      warnings: [
        createWarning({
          reason: "parse_failed",
          path: sourcePath,
          message: `Could not parse ${sourcePath}: unterminated YAML frontmatter`
        })
      ]
    };
  }

  const yamlText = normalizedText.slice(4, 4 + closingMatch.index);
  const parsed = parseYamlText(yamlText, sourcePath);

  if (!parsed.ok) {
    return { metadata: {}, warnings: parsed.warnings };
  }

  return { metadata: readRecord(parsed.value) ?? {}, warnings: parsed.warnings };
}

export function extractFirstHeading(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);

    if (match) {
      return match[1];
    }
  }

  return undefined;
}

// ─── Path utils ───────────────────────────────────────────────────────────────

export function toSensitivePath(
  filePath: string,
  context: Pick<AdapterContext, "cwd" | "homeDir">
): string {
  if (isPathInside(filePath, context.cwd)) {
    return path.relative(context.cwd, filePath) || path.basename(filePath);
  }

  if (isPathInside(filePath, context.homeDir)) {
    return path.relative(context.homeDir, filePath) || path.basename(filePath);
  }

  return path.basename(filePath);
}

export function safeReadOptions(
  filePath: string,
  context: Pick<AdapterContext, "cwd" | "homeDir">,
  extras: { warnOnMissing?: boolean } = {}
): { warnOnMissing: boolean; sensitivePath: string; allowedRoots: string[] } {
  return {
    warnOnMissing: extras.warnOnMissing ?? false,
    sensitivePath: toSensitivePath(filePath, context),
    allowedRoots: [context.homeDir, context.cwd]
  };
}

export async function buildLinkDetails(
  filePath: string,
  context: Pick<AdapterContext, "cwd" | "homeDir">
): Promise<{ linked?: boolean; linkTarget?: string }> {
  const info = await getLinkInfo(filePath);

  if (!info.linked || !info.linkTarget) {
    return {};
  }

  return {
    linked: true,
    linkTarget: toDisplayPath(info.linkTarget, { homeDir: context.homeDir })
  };
}

export function isDiscovered(
  context: AdapterContext,
  filePath: string | undefined
): boolean {
  if (!filePath) {
    return true;
  }

  return context.discoveredPaths.some(
    (p) => path.resolve(p.path) === path.resolve(filePath)
  );
}

// ─── Directory walker ─────────────────────────────────────────────────────────

export async function collectMarkdownFiles(
  directoryPath: string,
  state: AdapterState,
  context: AdapterContext
): Promise<string[]> {
  const entries = await safeReadDirectory(directoryPath, safeReadOptions(directoryPath, context));
  addWarningsToState(state, entries.warnings);

  if (!entries.ok) {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries.value) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath, state, context)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      if (context.isIgnored?.(path.relative(context.cwd, entryPath))) {
        continue;
      }

      files.push(entryPath);
    }
  }

  return files;
}
