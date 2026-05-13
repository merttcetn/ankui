import fs from "node:fs/promises";
import path from "node:path";

import {
  createMultiProjectTotals,
  createWarning,
  type MultiProjectScanResult,
  type ProjectScan,
  type ScanResult,
  type Warning
} from "../types.js";
import { relativizeHome } from "../utils/paths.js";
import { scan as defaultScan, type ScanOptions } from "./index.js";
import { parallelMap } from "./parallel.js";

export const PROJECT_MARKER_DIRS = [
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".opencode",
  ".skills"
] as const;

export const PROJECT_MARKER_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".cursorrules",
  ".mcp.json",
  "opencode.json",
  "opencode.jsonc"
] as const;

export interface DiscoveredProject {
  projectPath: string;
  displayPath: string;
}

export interface DiscoverProjectsResult {
  projects: DiscoveredProject[];
  warnings: Warning[];
}

export async function discoverProjects(
  devRoots: readonly string[],
  homeDir: string
): Promise<DiscoverProjectsResult> {
  const seen = new Set<string>();
  const projects: DiscoveredProject[] = [];
  const warnings: Warning[] = [];

  for (const devRoot of devRoots) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(devRoot, { withFileTypes: true });
    } catch (error) {
      warnings.push(
        createWarning({
          reason: "permission_denied",
          path: devRoot,
          message: `Cannot read dev root ${devRoot}: ${formatErrorMessage(error)}`
        })
      );
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;

      const projectPath = path.join(devRoot, entry.name);
      if (seen.has(projectPath)) continue;

      if (await hasProjectMarker(projectPath)) {
        seen.add(projectPath);
        projects.push({
          projectPath,
          displayPath: relativizeHome(projectPath, homeDir)
        });
      }
    }
  }

  return { projects, warnings };
}

async function hasProjectMarker(projectPath: string): Promise<boolean> {
  for (const dirName of PROJECT_MARKER_DIRS) {
    try {
      const stat = await fs.stat(path.join(projectPath, dirName));
      if (stat.isDirectory()) return true;
    } catch {
      // not present — try next
    }
  }
  for (const fileName of PROJECT_MARKER_FILES) {
    try {
      const stat = await fs.stat(path.join(projectPath, fileName));
      if (stat.isFile()) return true;
    } catch {
      // not present — try next
    }
  }
  return false;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface LoadAllScansOptions {
  devRoots: readonly string[];
  homeDir: string;
  env: Record<string, string | undefined>;
  now?: Date;
  /** Per-project scan budget (ms). Default 5000. */
  perProjectTimeoutMs?: number;
  /** Concurrency for project scans. Default 10. */
  concurrency?: number;
  /** Test hook — replaces the underlying `scan()` implementation. Not for production. */
  __scanForTesting?: (options: ScanOptions) => Promise<ScanResult>;
}

const DEFAULT_PER_PROJECT_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 10;

export async function loadAllScans(
  options: LoadAllScansOptions
): Promise<MultiProjectScanResult> {
  const now = options.now ?? new Date();
  const timeoutMs = options.perProjectTimeoutMs ?? DEFAULT_PER_PROJECT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const scanImpl = options.__scanForTesting ?? defaultScan;

  const warnings: Warning[] = [];
  const discovery = await discoverProjects(options.devRoots, options.homeDir);
  warnings.push(...discovery.warnings);

  const userScope = await scanImpl({
    cwd: options.homeDir,
    homeDir: options.homeDir,
    env: options.env,
    now
  });

  type ProjectOutcome = { project: ProjectScan } | { warning: Warning };

  const outcomes = await parallelMap<DiscoveredProject, ProjectOutcome>(
    discovery.projects,
    async (discovered) => {
      try {
        const scanResult = await runWithTimeout(
          () =>
            scanImpl({
              cwd: discovered.projectPath,
              homeDir: options.homeDir,
              env: options.env,
              now
            }),
          timeoutMs,
          `Project scan timed out after ${timeoutMs}ms`
        );
        return {
          project: {
            projectPath: discovered.projectPath,
            displayPath: discovered.displayPath,
            scan: scanResult
          }
        };
      } catch (error) {
        const reason = isTimeoutError(error) ? "adapter_timeout" : "non_disk_config_skipped";
        return {
          warning: createWarning({
            reason,
            path: discovered.projectPath,
            message:
              error instanceof Error
                ? error.message
                : `Project scan failed: ${String(error)}`
          })
        };
      }
    },
    { concurrency }
  );

  const projects: ProjectScan[] = [];
  for (const outcome of outcomes) {
    if ("project" in outcome) {
      projects.push(outcome.project);
    } else {
      warnings.push(outcome.warning);
    }
  }

  return {
    scannedAt: now.toISOString(),
    cwd: options.homeDir,
    homeDir: options.homeDir,
    devRoots: [...options.devRoots],
    userScope,
    projects,
    warnings,
    totals: createMultiProjectTotals({
      userScopeSkillCount: userScope.tools.reduce((n, t) => n + t.skills.length, 0),
      projectSkillCounts: projects.map((p) =>
        p.scan.tools.reduce((n, t) => n + t.skills.length, 0)
      )
    })
  };
}

class TimeoutError extends Error {
  readonly __ankuiTimeout = true;
}

function isTimeoutError(error: unknown): error is TimeoutError {
  return Boolean(error && typeof error === "object" && (error as TimeoutError).__ankuiTimeout);
}

async function runWithTimeout<R>(
  fn: () => Promise<R>,
  ms: number,
  message: string
): Promise<R> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<R>([
      fn(),
      new Promise<R>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface DevRootsConfig {
  devRoots: string[];
  warnings: Warning[];
}

export async function readDevRootsConfig(homeDir: string): Promise<DevRootsConfig> {
  const configPath = path.join(homeDir, ".config", "ankui", "config.json");
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    return {
      devRoots: [],
      warnings: [
        createWarning({
          reason: "permission_denied",
          path: configPath,
          message: `Cannot read ${configPath}: ${formatErrorMessage(error)}`
        })
      ]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      devRoots: [],
      warnings: [
        createWarning({
          reason: "parse_failed",
          path: configPath,
          message: `Failed to parse ${configPath}: ${formatErrorMessage(error)}`
        })
      ]
    };
  }

  const devRoots = extractDevRoots(parsed);
  return { devRoots, warnings: [] };
}

function extractDevRoots(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const candidate = (parsed as { devRoots?: unknown }).devRoots;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((entry): entry is string => typeof entry === "string");
}
