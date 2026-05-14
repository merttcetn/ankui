import React, { useEffect, useState } from "react";
import { render } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import { App, type DataSource } from "./App.js";
import { LoadingSplash } from "./components/LoadingSplash.js";

export interface RenderTuiLoadScanOptions {
  /** Function that resolves with the scan result. Called once on mount. */
  loadScan: () => Promise<MultiProjectScanResult>;
}

/**
 * Mount the TUI. Accepts one of three shapes:
 *
 *   1. `{ loadScan }` (Phase 8g): mount {@link LoadingSplash} immediately, swap
 *      to {@link App} when the promise resolves. Use this on the CLI launch
 *      path so the developer sees the FROM-themed loading rotation instead of a
 *      blank terminal during the multi-project scan.
 *   2. `MultiProjectScanResult` (legacy): mount {@link App} directly with the
 *      pre-loaded result. Used by tests and callers that have already scanned.
 *   3. {@link DataSource} (Phase 10): mount {@link App} with a subscribable
 *      data source for watch-mode rescans.
 */
export async function renderTui(
  input: RenderTuiLoadScanOptions | MultiProjectScanResult | DataSource
): Promise<void> {
  if (isLoadScanOptions(input)) {
    const instance = render(
      React.createElement(LauncherShell, { loadScan: input.loadScan })
    );
    await instance.waitUntilExit();
    return;
  }
  const props =
    "initial" in input
      ? { dataSource: input }
      : { result: input };
  const instance = render(React.createElement(App, props as never));
  await instance.waitUntilExit();
}

function isLoadScanOptions(
  input: RenderTuiLoadScanOptions | MultiProjectScanResult | DataSource
): input is RenderTuiLoadScanOptions {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as RenderTuiLoadScanOptions).loadScan === "function"
  );
}

interface LauncherShellProps {
  loadScan: () => Promise<MultiProjectScanResult>;
}

function LauncherShell({ loadScan }: LauncherShellProps): React.ReactElement {
  const [result, setResult] = useState<MultiProjectScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadScan()
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadScan]);

  if (error !== null) {
    return React.createElement(LoadingSplash, {
      active: false,
      completed: false
    });
  }
  if (result === null) {
    return React.createElement(LoadingSplash, { active: true });
  }
  return React.createElement(App, { result });
}
