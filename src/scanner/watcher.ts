import chokidar, { type FSWatcher } from "chokidar";

export interface CreateWatcherOptions {
  /** Absolute paths (files or directories) to watch. */
  paths: readonly string[];
  /** Called once per stable, non-ignored event. */
  onChange: (eventPath: string) => void;
  /** Synchronous predicate — true means "drop the event, do not call onChange". */
  isIgnored: (eventPath: string) => boolean;
  /** chokidar stabilityThreshold for coalescing rapid writes. Default 300ms. */
  debounceMs?: number;
}

export interface WatcherHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function createWatcher(options: CreateWatcherOptions): WatcherHandle {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let watcher: FSWatcher | undefined;
  let stopped = false;

  return {
    async start() {
      if (watcher || stopped) return;
      watcher = chokidar.watch(options.paths as string[], {
        // Don't follow symlinks — Phase 3 safety contract.
        followSymlinks: false,
        // Don't replay an "add" event for every existing file on startup.
        // We only care about post-launch changes.
        ignoreInitial: true,
        // Top-level ignore filter — chokidar calls this for every path it
        // considers, including descendants. Returning true short-circuits the
        // entire subtree.
        ignored: (eventPath: string) => options.isIgnored(eventPath),
        // Coalesce rapid editor-save bursts. chokidar emits a single event
        // once the file has been quiet for stabilityThreshold ms.
        awaitWriteFinish: {
          stabilityThreshold: debounceMs,
          pollInterval: Math.min(50, debounceMs)
        }
      });

      const forward = (eventPath: string): void => {
        if (stopped) return;
        if (options.isIgnored(eventPath)) return;
        options.onChange(eventPath);
      };

      watcher.on("add", forward);
      watcher.on("change", forward);
      watcher.on("unlink", forward);
      watcher.on("addDir", forward);
      watcher.on("unlinkDir", forward);
      // chokidar v4 reports errors via "error"; we swallow them — a per-watch
      // failure must never crash the host process.
      watcher.on("error", () => {
        // intentionally ignored; orchestrator surfaces failures separately
      });

      // Wait for chokidar to finish its first pass so the caller can trust
      // that subsequent fs operations will be observed.
      await new Promise<void>((resolve) => {
        if (!watcher) return resolve();
        const onReady = (): void => resolve();
        watcher.once("ready", onReady);
        // Safety net: don't hang forever if "ready" never fires (e.g. ghost path).
        setTimeout(resolve, 1000).unref();
      });
    },

    async stop() {
      stopped = true;
      if (!watcher) return;
      const w = watcher;
      watcher = undefined;
      try {
        await w.close();
      } catch {
        // closing twice or against a half-initialized watcher is fine
      }
    }
  };
}
