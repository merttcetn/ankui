import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { MultiProjectScanResult } from "../types.js";
import {
  loadAllScans as defaultLoadAllScans,
  readDevRootsConfig,
  PROJECT_MARKER_DIRS,
  PROJECT_MARKER_FILES,
  type LoadAllScansOptions
} from "../scanner/multi-project.js";
import { isSensitivePath } from "../scanner/safety.js";
import { createWatcher } from "../scanner/watcher.js";
import type { DataSource } from "../tui/App.js";
import { renderTui as defaultRenderTui } from "../tui/render.js";

export interface CollectWatchPathsOptions {
  homeDir: string;
  devRoots: readonly string[];
}

const USER_SCOPE_RELATIVE_PATHS: readonly string[] = [
  ".claude",
  ".claude.json",
  ".codex",
  ".cursor",
  ".gemini",
  ".config/opencode",
  ".skills",
  ".config/skills"
];

export async function collectWatchPaths(
  options: CollectWatchPathsOptions
): Promise<string[]> {
  const collected = new Set<string>();

  // User-scope: known tool config dirs/files under homeDir, only if they exist
  // and are not sensitive.
  for (const rel of USER_SCOPE_RELATIVE_PATHS) {
    const candidate = path.join(options.homeDir, rel);
    if (isSensitivePath(candidate)) continue;
    if (await pathExists(candidate)) {
      collected.add(candidate);
    }
  }

  // Project-scope: every immediate child of each dev root that has an AI marker.
  for (const devRoot of options.devRoots) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(devRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const projectPath = path.join(devRoot, entry.name);
      if (isSensitivePath(projectPath)) continue;
      if (await hasProjectMarker(projectPath)) {
        collected.add(projectPath);
      }
    }
  }

  return [...collected].sort();
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectMarker(projectPath: string): Promise<boolean> {
  for (const dirName of PROJECT_MARKER_DIRS) {
    try {
      const stat = await fs.stat(path.join(projectPath, dirName));
      if (stat.isDirectory()) return true;
    } catch {
      // not present
    }
  }
  for (const fileName of PROJECT_MARKER_FILES) {
    try {
      const stat = await fs.stat(path.join(projectPath, fileName));
      if (stat.isFile()) return true;
    } catch {
      // not present
    }
  }
  return false;
}

export interface RunWatchCommandOptions {
  /** Defaults to os.homedir(). */
  homeDir?: string;
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Override registered dev roots — used by tests. Otherwise read from ~/.config/ankui/config.json. */
  devRoots?: readonly string[];
  /** Watcher debounce in ms. Default 300. */
  debounceMs?: number;
  /** Test hook — replaces `loadAllScans`. */
  __loadAllScansForTesting?: (options: LoadAllScansOptions) => Promise<MultiProjectScanResult>;
  /** Test hook — replaces the Ink render call. */
  __mountTui?: (dataSource: DataSource) => Promise<{
    waitUntilExit: () => Promise<void>;
    unsubscribe: () => void;
  }>;
}

export interface RunWatchCommandHandle {
  /** Resolves when the TUI mounts and the user quits, or the test driver finishes. */
  exitPromise: Promise<void>;
  /** Explicit cleanup — stops the watcher even if the TUI did not call exit. */
  shutdown(): Promise<void>;
}

export async function runWatchCommand(
  options: RunWatchCommandOptions = {}
): Promise<RunWatchCommandHandle> {
  const homeDir = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;
  const loadAllScansImpl = options.__loadAllScansForTesting ?? defaultLoadAllScans;
  const mountTui = options.__mountTui ?? defaultMountTui;
  const debounceMs = options.debounceMs ?? 300;

  const devRoots =
    options.devRoots ?? (await readDevRootsConfig(homeDir)).devRoots;

  const watchPaths = await collectWatchPaths({ homeDir, devRoots });

  // Initial scan, awaited before mounting the TUI so the user sees real data
  // immediately (not a frame of empty state).
  const initial = await loadAllScansImpl({
    devRoots,
    homeDir,
    env
  });

  // Tiny pub-sub for the App's subscription.
  type Listener = (next: MultiProjectScanResult) => void;
  const listeners = new Set<Listener>();
  const subscribe = (cb: Listener): (() => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  // Rescan coordinator: serialize scans, collapse overlapping triggers.
  let scanInFlight = false;
  let rescanQueued = false;
  let stopped = false;

  const triggerRescan = async (): Promise<void> => {
    if (stopped) return;
    if (scanInFlight) {
      rescanQueued = true;
      return;
    }
    scanInFlight = true;
    try {
      const next = await loadAllScansImpl({ devRoots, homeDir, env });
      if (stopped) return;
      for (const listener of listeners) {
        try {
          listener(next);
        } catch {
          // a listener throwing must never crash the watch loop
        }
      }
    } catch (error) {
      // Per spec: scan failures become warnings on stderr, never crash.
      process.stderr.write(
        `ankui watch: rescan failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    } finally {
      scanInFlight = false;
      if (rescanQueued && !stopped) {
        rescanQueued = false;
        // Schedule on the macrotask queue so the current event loop tick clears.
        setImmediate(() => {
          void triggerRescan();
        });
      }
    }
  };

  const watcher = createWatcher({
    paths: watchPaths,
    onChange: () => {
      void triggerRescan();
    },
    isIgnored: (eventPath) => isSensitivePath(eventPath),
    debounceMs
  });
  await watcher.start();

  // Mount the TUI with a live data source.
  const tui = await mountTui({
    initial,
    subscribe
  });

  // SIGINT handler — clean shutdown.
  const onSigint = (): void => {
    void shutdown();
  };
  process.once("SIGINT", onSigint);

  const shutdown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    process.off("SIGINT", onSigint);
    await watcher.stop();
    tui.unsubscribe();
  };

  const exitPromise = (async () => {
    try {
      await tui.waitUntilExit();
    } finally {
      await shutdown();
    }
  })();

  return { exitPromise, shutdown };
}

async function defaultMountTui(dataSource: DataSource): Promise<{
  waitUntilExit: () => Promise<void>;
  unsubscribe: () => void;
}> {
  // Track the App-side unsubscribe through the subscribe closure: we wrap the
  // caller's subscribe to capture and return its cleanup function.
  let appUnsubscribe: (() => void) | undefined;
  const wrapped: DataSource = {
    initial: dataSource.initial,
    subscribe: (cb) => {
      const off = dataSource.subscribe!(cb);
      appUnsubscribe = off;
      return off;
    }
  };
  const waitUntilExit = defaultRenderTui(wrapped);
  return {
    waitUntilExit: () => waitUntilExit,
    unsubscribe: () => {
      appUnsubscribe?.();
    }
  };
}
