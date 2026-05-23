import type { MultiProjectScanResult } from "../types.js";

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

/** Writes new dev roots to ~/.config/ankui/config.json and returns the post-write scan. */
export async function applyConfig(
  devRoots: string[]
): Promise<ConfigResponse> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: {
      "x-ankui-token": token(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ devRoots })
  });
  if (!res.ok) {
    throw new Error(`config request failed (${res.status})`);
  }
  return (await res.json()) as ConfigResponse;
}
