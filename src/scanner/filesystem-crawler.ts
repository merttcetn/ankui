import fs from "node:fs/promises";
import path from "node:path";

import { createWarning, type Warning } from "../types.js";

export const DEFAULT_MAX_DEPTH = 6;
export const DEFAULT_CRAWL_CONCURRENCY = 16;

export const DEFAULT_SKIP_NAMES: ReadonlySet<string> = new Set([
  // macOS junk
  "Library",
  "Music",
  "Pictures",
  "Movies",
  "Applications",
  "Public",
  ".Trash",
  // Package caches
  "node_modules",
  ".npm",
  ".pnpm-store",
  ".yarn",
  ".cache",
  ".cargo",
  ".rustup",
  ".gem",
  ".go",
  // Dev clutter
  ".local",
  ".config",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "target",
  // Build/IDE
  ".idea",
  ".vscode",
  ".gradle",
  ".m2"
]);

export const DEFAULT_MARKER_DIRS: ReadonlySet<string> = new Set([
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".opencode",
  ".skills"
]);

export const DEFAULT_MARKER_FILES: ReadonlySet<string> = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".cursorrules",
  ".mcp.json",
  "opencode.json",
  "opencode.jsonc"
]);

export interface FoundProject {
  projectPath: string;
  parentPath: string;
  markers: string[];
  depth: number;
}

export interface CrawlOptions {
  rootDir: string;
  maxDepth?: number;
  skipNames?: ReadonlySet<string>;
  markerDirs?: ReadonlySet<string>;
  markerFiles?: ReadonlySet<string>;
  concurrency?: number;
  signal?: AbortSignal;
  onProject?: (project: FoundProject) => void;
}

export interface CrawlStats {
  pathsVisited: number;
  durationMs: number;
}

export interface CrawlResult {
  projects: FoundProject[];
  warnings: Warning[];
  stats: CrawlStats;
}

export async function crawlForProjects(options: CrawlOptions): Promise<CrawlResult> {
  const rootDir = options.rootDir;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skipNames = options.skipNames ?? DEFAULT_SKIP_NAMES;
  const markerDirs = options.markerDirs ?? DEFAULT_MARKER_DIRS;
  const markerFiles = options.markerFiles ?? DEFAULT_MARKER_FILES;
  const concurrency = options.concurrency ?? DEFAULT_CRAWL_CONCURRENCY;

  const projects: FoundProject[] = [];
  const warnings: Warning[] = [];
  const start = Date.now();
  let pathsVisited = 0;
  const visited = new Set<string>();

  await visitDirectory({
    dirPath: rootDir,
    depth: 0,
    maxDepth,
    skipNames,
    markerDirs,
    markerFiles,
    projects,
    warnings,
    onProject: options.onProject,
    incrementVisited: () => {
      pathsVisited += 1;
    },
    visited,
    concurrency
  });

  return {
    projects,
    warnings,
    stats: {
      pathsVisited,
      durationMs: Date.now() - start
    }
  };
}

interface VisitArgs {
  dirPath: string;
  depth: number;
  maxDepth: number;
  skipNames: ReadonlySet<string>;
  markerDirs: ReadonlySet<string>;
  markerFiles: ReadonlySet<string>;
  projects: FoundProject[];
  warnings: Warning[];
  onProject: ((project: FoundProject) => void) | undefined;
  incrementVisited: () => void;
  visited: Set<string>;
  concurrency: number;
}

async function visitDirectory(args: VisitArgs): Promise<void> {
  let realPath: string;
  try {
    realPath = await fs.realpath(args.dirPath);
  } catch (error) {
    args.warnings.push(
      createWarning({
        reason: classifyFsError(error),
        path: args.dirPath,
        message: `Cannot resolve realpath ${args.dirPath}: ${formatErrorMessage(error)}`
      })
    );
    return;
  }

  if (args.visited.has(realPath)) return;
  args.visited.add(realPath);

  args.incrementVisited();

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(args.dirPath, { withFileTypes: true });
  } catch (error) {
    args.warnings.push(
      createWarning({
        reason: classifyFsError(error),
        path: args.dirPath,
        message: `Cannot read ${args.dirPath}: ${formatErrorMessage(error)}`
      })
    );
    return;
  }

  const matchedMarkers: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && args.markerDirs.has(entry.name)) {
      matchedMarkers.push(entry.name);
    } else if (entry.isFile() && args.markerFiles.has(entry.name)) {
      matchedMarkers.push(entry.name);
    }
  }

  if (matchedMarkers.length > 0 && args.depth > 0) {
    const project: FoundProject = {
      projectPath: args.dirPath,
      parentPath: path.dirname(args.dirPath),
      markers: matchedMarkers,
      depth: args.depth
    };
    args.projects.push(project);
    args.onProject?.(project);
  }

  if (args.depth >= args.maxDepth) return;

  const childrenToVisit: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const childName = entry.name;

    // Skip list — applies at any depth.
    if (args.skipNames.has(childName)) continue;

    // Marker directories are LEAVES. We've already recorded the parent above.
    // Do not descend into them.
    if (args.markerDirs.has(childName)) continue;

    // Hidden dirs at any depth are skipped UNLESS the dir is itself a marker
    // (handled by the markerDirs branch above). Reaching this point with a
    // leading-dot child means it's hidden and NOT a marker → skip.
    if (childName.startsWith(".")) continue;

    childrenToVisit.push(path.join(args.dirPath, childName));
  }

  await runWithConcurrency(childrenToVisit, args.concurrency, async (childPath) => {
    await visitDirectory({
      ...args,
      dirPath: childPath,
      depth: args.depth + 1
    });
  });
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;

  async function next(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      await worker(items[i] as T);
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w += 1) {
    workers.push(next());
  }
  await Promise.all(workers);
}

function classifyFsError(error: unknown): Warning["reason"] {
  if (isNodeError(error)) {
    if (error.code === "EACCES" || error.code === "EPERM") return "permission_denied";
    if (error.code === "ENOENT") return "permission_denied";
  }
  return "unknown";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
