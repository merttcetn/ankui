import path from "node:path";

import { createWarning, type Scope, type ToolId, type Warning } from "../types.js";
import { isPathInside, resolveLocalPath } from "./paths.js";
import { listRipgrepFiles } from "./ripgrep.js";
import { checkSafePath, safeReadTextFile } from "./safety.js";

type ExpectedEntryType = "file" | "directory";
type DiscoverySource = "known_user_path" | "known_project_path" | "opencode_env";

export interface DiscoveredPath {
  toolId: ToolId;
  scope: Scope;
  path: string;
  entryType: ExpectedEntryType;
  source: DiscoverySource;
}

export interface SkippedPath {
  toolId?: ToolId;
  scope?: Scope;
  path?: string;
  reason: Warning["reason"];
  warning: Warning;
}

export interface DiscoveryResult {
  paths: DiscoveredPath[];
  skippedPaths: SkippedPath[];
  warnings: Warning[];
}

export interface DiscoveryOptions {
  cwd: string;
  homeDir: string;
  env?: Record<string, string | undefined>;
}

interface KnownPathCandidate {
  toolIds: ToolId[];
  scope: Scope;
  basePath: string;
  relativePath: string;
  entryType: ExpectedEntryType;
  source: DiscoverySource;
}

interface AbsoluteCandidate {
  toolIds: ToolId[];
  scope: Scope;
  path: string;
  sensitivePath: string;
  entryType: ExpectedEntryType;
  source: DiscoverySource;
}

const USER_PATHS: Array<Omit<KnownPathCandidate, "basePath" | "scope" | "source">> = [
  { toolIds: ["claude"], relativePath: ".claude", entryType: "directory" },
  { toolIds: ["claude"], relativePath: ".claude.json", entryType: "file" },
  { toolIds: ["codex"], relativePath: ".codex", entryType: "directory" },
  { toolIds: ["cursor"], relativePath: ".cursor", entryType: "directory" },
  { toolIds: ["gemini"], relativePath: ".gemini", entryType: "directory" },
  { toolIds: ["opencode"], relativePath: ".config/opencode", entryType: "directory" },
  { toolIds: ["skills-sh"], relativePath: ".skills", entryType: "directory" },
  { toolIds: ["skills-sh"], relativePath: ".config/skills", entryType: "directory" }
];

const PROJECT_FILE_PATHS: Array<Omit<KnownPathCandidate, "basePath" | "scope" | "source">> = [
  { toolIds: ["claude"], relativePath: "CLAUDE.md", entryType: "file" },
  { toolIds: ["codex", "opencode"], relativePath: "AGENTS.md", entryType: "file" },
  { toolIds: ["gemini"], relativePath: "GEMINI.md", entryType: "file" },
  { toolIds: ["opencode"], relativePath: "opencode.json", entryType: "file" },
  { toolIds: ["opencode"], relativePath: "opencode.jsonc", entryType: "file" },
  { toolIds: ["cursor"], relativePath: ".cursorrules", entryType: "file" },
  { toolIds: ["cursor"], relativePath: ".mcp.json", entryType: "file" }
];

const PROJECT_DIRECTORY_PATHS: Array<
  Omit<KnownPathCandidate, "basePath" | "scope" | "source">
> = [
  { toolIds: ["claude"], relativePath: ".claude", entryType: "directory" },
  { toolIds: ["cursor"], relativePath: ".cursor", entryType: "directory" },
  { toolIds: ["gemini"], relativePath: ".gemini", entryType: "directory" },
  { toolIds: ["codex"], relativePath: ".codex", entryType: "directory" },
  { toolIds: ["opencode"], relativePath: ".opencode", entryType: "directory" },
  { toolIds: ["skills-sh"], relativePath: ".skills", entryType: "directory" }
];

const PROJECT_FILE_NAMES = PROJECT_FILE_PATHS.map((candidate) => candidate.relativePath);

const PROJECT_DISCOVERY_EXCLUDES = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/{session,sessions,history,histories,conversation,conversations}/**",
  "**/.opencode/{auth,cache,log,logs,share,database,databases,db,runtime,session,sessions}/**",
  "**/opencode/{auth,cache,log,logs,share,database,databases,db,runtime,session,sessions}/**"
];

export async function discover(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const cwd = path.resolve(options.cwd);
  const homeDir = path.resolve(options.homeDir);
  const state = createDiscoveryState();
  const gitignore = await readRootGitignore(cwd);

  for (const warning of gitignore.warnings) {
    addWarning(state, warning);
  }

  await addKnownCandidates(
    state,
    USER_PATHS.map((candidate) => ({
      ...candidate,
      basePath: homeDir,
      scope: "user" as const,
      source: "known_user_path" as const
    }))
  );

  await discoverProjectFiles(state, cwd, gitignore.patterns);

  await addKnownCandidates(
    state,
    PROJECT_DIRECTORY_PATHS.map((candidate) => ({
      ...candidate,
      basePath: cwd,
      scope: "project" as const,
      source: "known_project_path" as const
    })).filter((candidate) => !isIgnoredByRootGitignore(candidate.relativePath, gitignore.patterns))
  );

  await discoverOpenCodeEnvPaths(state, {
    cwd,
    homeDir,
    env: options.env ?? process.env
  });

  return {
    paths: state.paths,
    skippedPaths: state.skippedPaths,
    warnings: state.warnings
  };
}

function createDiscoveryState(): {
  paths: DiscoveredPath[];
  skippedPaths: SkippedPath[];
  warnings: Warning[];
  pathKeys: Set<string>;
  warningKeys: Set<string>;
  skippedKeys: Set<string>;
} {
  return {
    paths: [],
    skippedPaths: [],
    warnings: [],
    pathKeys: new Set(),
    warningKeys: new Set(),
    skippedKeys: new Set()
  };
}

async function addKnownCandidates(
  state: ReturnType<typeof createDiscoveryState>,
  candidates: KnownPathCandidate[]
): Promise<void> {
  for (const candidate of candidates) {
    await addAbsoluteCandidate(state, {
      ...candidate,
      path: path.resolve(candidate.basePath, candidate.relativePath),
      sensitivePath: candidate.relativePath
    });
  }
}

async function discoverProjectFiles(
  state: ReturnType<typeof createDiscoveryState>,
  cwd: string,
  gitignorePatterns: string[]
): Promise<void> {
  const rgResult = await listRipgrepFiles({
    cwd,
    excludeGlobs: PROJECT_DISCOVERY_EXCLUDES
  });

  for (const warning of rgResult.warnings) {
    addWarning(state, warning);
  }

  const rootFiles = new Set(
    rgResult.paths
      .map((entry) => normalizeRelativePath(entry))
      .filter((entry) => path.posix.dirname(entry) === ".")
      .filter((entry) => PROJECT_FILE_NAMES.includes(entry))
      .filter((entry) => !isIgnoredByRootGitignore(entry, gitignorePatterns))
  );

  const candidates = PROJECT_FILE_PATHS.filter((candidate) =>
    rootFiles.has(candidate.relativePath)
  ).map((candidate) => ({
    ...candidate,
    basePath: cwd,
    scope: "project" as const,
    source: "known_project_path" as const
  }));

  await addKnownCandidates(state, candidates);
}

async function discoverOpenCodeEnvPaths(
  state: ReturnType<typeof createDiscoveryState>,
  options: {
    cwd: string;
    homeDir: string;
    env: Record<string, string | undefined>;
  }
): Promise<void> {
  if (hasEnvValue(options.env.OPENCODE_CONFIG_CONTENT)) {
    addSkippedWarning(state, {
      toolId: "opencode",
      path: "OPENCODE_CONFIG_CONTENT",
      reason: "non_disk_config_skipped",
      message: "Skipped OPENCODE_CONFIG_CONTENT because it is inline config, not a local disk path."
    });
  }

  await addOpenCodeEnvPath(state, options, "OPENCODE_CONFIG", "file");
  await addOpenCodeEnvPath(state, options, "OPENCODE_CONFIG_DIR", "directory");
}

async function addOpenCodeEnvPath(
  state: ReturnType<typeof createDiscoveryState>,
  options: {
    cwd: string;
    homeDir: string;
    env: Record<string, string | undefined>;
  },
  envName: "OPENCODE_CONFIG" | "OPENCODE_CONFIG_DIR",
  entryType: ExpectedEntryType
): Promise<void> {
  const value = options.env[envName];

  if (!hasEnvValue(value)) {
    return;
  }

  if (isRemoteReference(value)) {
    addSkippedWarning(state, {
      toolId: "opencode",
      path: envName,
      reason: "remote_reference_skipped",
      message: `Skipped ${envName} because it points to a remote reference, not a local disk path.`
    });
    return;
  }

  const resolvedPath = resolveLocalPath(value.trim(), {
    cwd: options.cwd,
    homeDir: options.homeDir
  });
  const scope: Scope = isPathInside(resolvedPath, options.cwd) ? "project" : "user";

  await addAbsoluteCandidate(state, {
    toolIds: ["opencode"],
    scope,
    path: resolvedPath,
    sensitivePath: createEnvSensitivePath(resolvedPath, options),
    entryType,
    source: "opencode_env"
  });
}

async function addAbsoluteCandidate(
  state: ReturnType<typeof createDiscoveryState>,
  candidate: AbsoluteCandidate
): Promise<void> {
  const normalizedPath = path.resolve(candidate.path);
  const safety = await checkSafePath(normalizedPath, {
    expectedType: candidate.entryType,
    sensitivePath: candidate.sensitivePath,
    warnOnMissing: false
  });

  if (!safety.ok) {
    for (const toolId of candidate.toolIds) {
      for (const warning of safety.warnings) {
        addSkippedPath(state, {
          toolId,
          scope: candidate.scope,
          path: normalizedPath,
          reason: warning.reason,
          warning
        });
      }
    }
    return;
  }

  for (const toolId of candidate.toolIds) {
    const key = `${toolId}:${normalizedPath}`;

    if (state.pathKeys.has(key)) {
      continue;
    }

    state.pathKeys.add(key);
    state.paths.push({
      toolId,
      scope: candidate.scope,
      path: normalizedPath,
      entryType: candidate.entryType,
      source: candidate.source
    });
  }
}

function addSkippedWarning(
  state: ReturnType<typeof createDiscoveryState>,
  input: {
    toolId?: ToolId;
    scope?: Scope;
    path?: string;
    reason: Warning["reason"];
    message: string;
  }
): void {
  const warning = createWarning({
    reason: input.reason,
    path: input.path,
    message: input.message
  });

  addSkippedPath(state, {
    toolId: input.toolId,
    scope: input.scope,
    path: input.path,
    reason: input.reason,
    warning
  });
}

function addSkippedPath(
  state: ReturnType<typeof createDiscoveryState>,
  skippedPath: SkippedPath
): void {
  addWarning(state, skippedPath.warning);

  const key = `${skippedPath.toolId ?? ""}:${skippedPath.warning.id}`;

  if (state.skippedKeys.has(key)) {
    return;
  }

  state.skippedKeys.add(key);
  state.skippedPaths.push(skippedPath);
}

function addWarning(state: ReturnType<typeof createDiscoveryState>, warning: Warning): void {
  if (state.warningKeys.has(warning.id)) {
    return;
  }

  state.warningKeys.add(warning.id);
  state.warnings.push(warning);
}

function normalizeRelativePath(inputPath: string): string {
  return inputPath.split(/[\\/]+/).join("/");
}

async function readRootGitignore(cwd: string): Promise<{ patterns: string[]; warnings: Warning[] }> {
  const gitignorePath = path.join(cwd, ".gitignore");
  const result = await safeReadTextFile(gitignorePath, {
    sensitivePath: ".gitignore",
    warnOnMissing: false
  });

  if (!result.ok) {
    return {
      patterns: [],
      warnings: result.warnings
    };
  }

  return {
    patterns: result.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
    warnings: result.warnings
  };
}

function isIgnoredByRootGitignore(relativePath: string, patterns: string[]): boolean {
  let ignored = false;

  for (const rawPattern of patterns) {
    const negated = rawPattern.startsWith("!");
    const pattern = normalizeGitignorePattern(negated ? rawPattern.slice(1) : rawPattern);

    if (pattern.length === 0 || !matchesRootGitignorePattern(relativePath, pattern)) {
      continue;
    }

    ignored = !negated;
  }

  return ignored;
}

function normalizeGitignorePattern(pattern: string): string {
  return pattern.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function matchesRootGitignorePattern(relativePath: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const contentsGlobBase = getContentsGlobBase(pattern);

  if (contentsGlobBase && matchesGlob(normalizedPath, contentsGlobBase)) {
    return true;
  }

  if (pattern.includes("/")) {
    return matchesGlob(normalizedPath, pattern);
  }

  return matchesGlob(path.posix.basename(normalizedPath), pattern);
}

function getContentsGlobBase(pattern: string): string | undefined {
  if (pattern.endsWith("/**")) {
    return pattern.slice(0, -3);
  }

  if (pattern.endsWith("/*")) {
    return pattern.slice(0, -2);
  }

  return undefined;
}

function matchesGlob(value: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .split("*")
      .map((part) => escapeRegExp(part))
      .join(".*")}$`
  );

  return regex.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function hasEnvValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function createEnvSensitivePath(
  resolvedPath: string,
  context: {
    cwd: string;
    homeDir: string;
  }
): string {
  if (isPathInside(resolvedPath, context.cwd)) {
    return path.relative(context.cwd, resolvedPath);
  }

  if (isPathInside(resolvedPath, context.homeDir)) {
    return path.relative(context.homeDir, resolvedPath);
  }

  return path.basename(resolvedPath);
}

function isRemoteReference(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();

  return (
    /^[a-z][a-z0-9+.-]*:\/\//.test(normalizedValue) ||
    normalizedValue.startsWith("git@") ||
    normalizedValue.startsWith("github:") ||
    normalizedValue.startsWith("gitlab:")
  );
}
