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
import { parseYamlText, readMarkdownFile } from "../parsing.js";
import { countTextLines, createSanitizedPreview } from "../preview.js";
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
    const recovered = recoverFrontmatterFields(yamlText);

    if (Object.keys(recovered).length > 0) {
      return { metadata: recovered, warnings: [] };
    }

    return { metadata: {}, warnings: parsed.warnings };
  }

  return { metadata: readRecord(parsed.value) ?? {}, warnings: parsed.warnings };
}

// Permissive fallback: when strict YAML rejects frontmatter that Claude itself
// accepts (bracket values, multi-line description blocks with embedded XML, etc.),
// scan top-level `key: value` lines so we still surface the skill's metadata.
const YAML_LONE_INDICATORS = new Set([
  "[",
  "]",
  "{",
  "}",
  "&",
  "*",
  ">",
  "|",
  ":",
  "-",
  "?",
  "!"
]);

function recoverFrontmatterFields(yamlText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const keyValue = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;

  for (const line of yamlText.split("\n")) {
    const match = keyValue.exec(line);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const trimmed = rawValue.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.length === 1 && YAML_LONE_INDICATORS.has(trimmed)) {
      continue;
    }

    const quoted = /^"(.*)"$|^'(.*)'$/.exec(trimmed);

    result[key] = quoted ? (quoted[1] ?? quoted[2] ?? "") : trimmed;
  }

  return result;
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

// ─── Markdown-backed skill builder ────────────────────────────────────────────

export interface BuildMarkdownSkillOptions {
  filePath: string;
  toolId: ToolId;
  scope: Scope;
  kind: SkillKind;
  source: SkillSource;
  fallbackName: string;
  summaryFallback: string;
  warnOnMissing: boolean;
  /** Extra fields merged into the skill's details object. */
  extraDetails?: Record<string, unknown>;
}

export interface BuildMarkdownSkillResult {
  skill: Skill | undefined;
  warnings: Warning[];
}

export async function buildMarkdownSkill(
  context: Pick<AdapterContext, "cwd" | "homeDir">,
  options: BuildMarkdownSkillOptions
): Promise<BuildMarkdownSkillResult> {
  const warnings: Warning[] = [];

  const result = await readMarkdownFile(
    options.filePath,
    safeReadOptions(options.filePath, context, { warnOnMissing: options.warnOnMissing })
  );
  warnings.push(...result.warnings);

  if (!result.ok) {
    return { skill: undefined, warnings };
  }

  const frontmatter = parseMarkdownFrontmatter(result.value, options.filePath);
  warnings.push(...frontmatter.warnings);

  const name =
    firstString(frontmatter.metadata.name, frontmatter.metadata.title) ?? options.fallbackName;
  const summary =
    firstString(frontmatter.metadata.description, frontmatter.metadata.summary) ??
    extractFirstHeading(result.value) ??
    options.summaryFallback;

  const linkDetails = await buildLinkDetails(options.filePath, context);

  const skill = buildSkill({
    toolId: options.toolId,
    kind: options.kind,
    name,
    summary,
    scope: options.scope,
    sourcePath: options.filePath,
    source: options.source,
    details: {
      preview: createSanitizedPreview(result.value, options.filePath),
      lineCount: countTextLines(result.value),
      ...linkDetails,
      ...options.extraDetails
    }
  });

  return { skill, warnings };
}

// ─── Markdown-skill tree walker ───────────────────────────────────────────────

export interface ScanMarkdownSkillTreeOptions {
  parent: string;
  context: Pick<AdapterContext, "cwd" | "homeDir">;
  /** Tool id stamped on each emitted skill. Defaults to "claude". */
  toolId?: ToolId;
  /** Kind stamped on each emitted skill. Defaults to "agent_skill". */
  kind?: SkillKind;
  /** Scope stamped on each emitted skill. Defaults to "user". */
  scope?: Scope;
}

export interface ScanMarkdownSkillTreeResult {
  active: Skill[];
  disabled: Skill[];
  warnings: Warning[];
}

export async function scanMarkdownSkillTree(
  options: ScanMarkdownSkillTreeOptions
): Promise<ScanMarkdownSkillTreeResult> {
  const { parent, context } = options;
  const toolId: ToolId = options.toolId ?? "claude";
  const kind: SkillKind = options.kind ?? "agent_skill";
  const scope: Scope = options.scope ?? "user";

  const active: Skill[] = [];
  const disabled: Skill[] = [];
  const warnings: Warning[] = [];

  // Walk active children (skip .disabled/)
  const activeEntries = await safeReadDirectory(
    parent,
    safeReadOptions(parent, context, { warnOnMissing: false })
  );
  warnings.push(...activeEntries.warnings);

  if (activeEntries.ok) {
    for (const entry of activeEntries.value) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      if (entry.name === ".disabled") {
        continue;
      }

      const skillPath = path.join(parent, entry.name, "SKILL.md");
      const built = await buildMarkdownSkill(context, {
        filePath: skillPath,
        toolId,
        kind,
        scope,
        source: "directory",
        fallbackName: entry.name,
        summaryFallback: "Agent skill.",
        warnOnMissing: false
      });
      warnings.push(...built.warnings);

      if (built.skill) {
        active.push(built.skill);
      }
    }
  }

  // Walk .disabled/ children
  const disabledDir = path.join(parent, ".disabled");
  const disabledEntries = await safeReadDirectory(
    disabledDir,
    safeReadOptions(disabledDir, context, { warnOnMissing: false })
  );
  warnings.push(...disabledEntries.warnings);

  if (disabledEntries.ok) {
    for (const entry of disabledEntries.value) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const skillPath = path.join(disabledDir, entry.name, "SKILL.md");
      const built = await buildMarkdownSkill(context, {
        filePath: skillPath,
        toolId,
        kind,
        scope,
        source: "directory",
        fallbackName: entry.name,
        summaryFallback: "Agent skill.",
        warnOnMissing: false,
        extraDetails: { disabled: true }
      });
      warnings.push(...built.warnings);

      if (built.skill) {
        disabled.push(built.skill);
      }
    }
  }

  return { active, disabled, warnings };
}
