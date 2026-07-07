import type { MultiProjectScanResult } from "../types.js";
import type {
  SnapshotDiffResult,
  SnapshotDocument,
  SnapshotMetadata,
  SnapshotStoreWarning
} from "../snapshots/types.js";

export interface ActionRequest {
  skillId: string;
  action: "disable" | "enable";
}

export interface ActionOutcome {
  skillId: string;
  ok: boolean;
  message: string;
}

export interface ActionsResponse {
  outcomes: ActionOutcome[];
  scan: MultiProjectScanResult;
}

export interface ConfigResponse {
  scan: MultiProjectScanResult;
}

export interface SnapshotStateResponse {
  scan: MultiProjectScanResult;
  current: SnapshotDocument;
  latest?: SnapshotDocument;
  snapshots: SnapshotMetadata[];
  warnings: SnapshotStoreWarning[];
  diff?: SnapshotDiffResult;
}

export async function fetchSnapshotState(): Promise<SnapshotStateResponse> {
  return fetchSnapshotJson("/api/snapshot-state");
}

export async function fetchSnapshot(id: string): Promise<SnapshotDocument> {
  return fetchSnapshotJson(`/api/snapshots/${encodeURIComponent(id)}`);
}

export async function createSnapshot(label?: string): Promise<SnapshotStateResponse> {
  return fetchSnapshotJson("/api/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(label?.trim() ? { label: label.trim() } : {}) })
  });
}

export async function removeSnapshot(id: string): Promise<SnapshotStateResponse> {
  return fetchSnapshotJson(`/api/snapshots/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

async function fetchSnapshotJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-ankui-token", token());
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `snapshot request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function token(): string {
  return (window as unknown as { __ANKUI_TOKEN__?: string }).__ANKUI_TOKEN__ ?? "";
}

/** Fetches a fresh multi-project scan. */
export async function fetchScan(): Promise<MultiProjectScanResult> {
  const res = await fetch("/api/scan", {
    headers: { "x-ankui-token": token() }
  });
  if (!res.ok) {
    throw new Error(`scan request failed (${res.status})`);
  }
  return (await res.json()) as MultiProjectScanResult;
}

/** Applies enable/disable changes and returns the post-write scan. */
export async function applyActions(
  changes: ActionRequest[]
): Promise<ActionsResponse> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: {
      "x-ankui-token": token(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ changes })
  });
  if (!res.ok) {
    throw new Error(`actions request failed (${res.status})`);
  }
  return (await res.json()) as ActionsResponse;
}

/**
 * Writes new dev roots to ~/.config/ankui/config.json using optimistic
 * concurrency: `expected` is the client's last-known on-disk list. If the
 * server's on-disk list has drifted (e.g. a CLI run wrote to it), the call
 * fails with 409 and a fresh scan, which the caller surfaces so the user
 * can re-apply their edit.
 */
export async function applyConfig(
  expected: string[],
  desired: string[]
): Promise<ConfigResponse> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: {
      "x-ankui-token": token(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ expected, desired })
  });
  if (res.status === 409) {
    const data = (await res.json()) as { error: string; scan: MultiProjectScanResult };
    const err = new Error(data.error) as Error & { freshScan?: MultiProjectScanResult };
    err.freshScan = data.scan;
    throw err;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `config request failed (${res.status})`);
  }
  return (await res.json()) as ConfigResponse;
}

// ----- Bundle update -----

export type BundleCheckResult =
  | { status: "not_found" }
  | { status: "up_to_date"; pinnedSha: string }
  | {
      status: "ahead";
      pinnedSha: string;
      latestSha: string;
      count: number;
      changes: { added: string[]; removed: string[]; modified: string[] };
    };

export interface BundleUpdateResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
  scan: MultiProjectScanResult;
}

/** Asks the server whether the upstream of a tracked bundle has changes. */
export async function checkBundle(name: string): Promise<BundleCheckResult> {
  const res = await fetch("/api/bundles/check", {
    method: "POST",
    headers: { "x-ankui-token": token(), "content-type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (res.status === 404) {
    return { status: "not_found" };
  }
  if (!res.ok) {
    throw new Error(`check request failed (${res.status})`);
  }
  return (await res.json()) as BundleCheckResult;
}

/**
 * Applies a pending bundle update. `expectedSha` must match the bundle's
 * pinned SHA on the server (the optimistic-concurrency guard). Returns the
 * combined update result plus a fresh scan.
 */
export async function updateBundle(
  name: string,
  expectedSha: string
): Promise<BundleUpdateResult> {
  const res = await fetch("/api/bundles/update", {
    method: "POST",
    headers: { "x-ankui-token": token(), "content-type": "application/json" },
    body: JSON.stringify({ name, expectedSha })
  });
  if (res.status === 409) {
    const data = (await res.json()) as { error: string };
    const err = new Error(data.error) as Error & { sha_conflict?: boolean };
    err.sha_conflict = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`update request failed (${res.status})`);
  }
  return (await res.json()) as BundleUpdateResult;
}
