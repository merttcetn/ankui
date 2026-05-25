import { useCallback, useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { checkBundle, updateBundle } from "../api.js";

export type UpdateStatus =
  | { state: "unknown" }
  | { state: "checking" }
  | { state: "up_to_date"; pinnedSha: string }
  | {
      state: "ahead";
      pinnedSha: string;
      latestSha: string;
      count: number;
      changes: { added: string[]; removed: string[]; modified: string[] };
    }
  | { state: "applying" }
  | { state: "error"; message: string };

export interface ApplyOptions {
  /** Called with the post-update scan so the page can refresh state. */
  onScan?: (scan: MultiProjectScanResult) => void;
}

export interface BundleStatusHook {
  statuses: Map<string, UpdateStatus>;
  check: (name: string) => Promise<void>;
  apply: (name: string, expectedSha: string, opts?: ApplyOptions) => Promise<void>;
  reset: (name: string) => void;
}

/**
 * Tracks per-bundle update status (check/apply lifecycle). Keyed by the
 * registry `name` (e.g. `owner/repo`). Each bundle moves through its own
 * mini state machine; one bundle's checking state never blocks another.
 */
export function useBundleStatus(): BundleStatusHook {
  const [statuses, setStatuses] = useState<Map<string, UpdateStatus>>(
    () => new Map()
  );

  const set = (name: string, s: UpdateStatus): void => {
    setStatuses((prev) => new Map(prev).set(name, s));
  };

  const check = useCallback(async (name: string): Promise<void> => {
    set(name, { state: "checking" });
    try {
      const r = await checkBundle(name);
      if (r.status === "not_found") {
        set(name, { state: "error", message: "bundle not in registry" });
      } else if (r.status === "up_to_date") {
        set(name, { state: "up_to_date", pinnedSha: r.pinnedSha });
      } else {
        set(name, {
          state: "ahead",
          pinnedSha: r.pinnedSha,
          latestSha: r.latestSha,
          count: r.count,
          changes: r.changes
        });
      }
    } catch (e) {
      set(name, { state: "error", message: (e as Error).message });
    }
  }, []);

  const apply = useCallback(
    async (name: string, expectedSha: string, opts?: ApplyOptions): Promise<void> => {
      set(name, { state: "applying" });
      try {
        const result = await updateBundle(name, expectedSha);
        // The /api/bundles/update route returns HTTP 200 even when the
        // underlying runUpdateCommand failed (e.g. an added-skill conflict);
        // exitCode is the real signal. Without this check the UI would falsely
        // mark a broken update as "up to date" and the user would see no
        // surfaced stderr.
        if (result.exitCode !== 0) {
          const message = result.stderr.join("\n").trim() || `update failed (exit ${result.exitCode})`;
          set(name, { state: "error", message });
          return;
        }
        opts?.onScan?.(result.scan);
        set(name, { state: "up_to_date", pinnedSha: expectedSha });
      } catch (e) {
        set(name, { state: "error", message: (e as Error).message });
      }
    },
    []
  );

  const reset = useCallback((name: string): void => {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  return { statuses, check, apply, reset };
}
