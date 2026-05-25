import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { MultiProjectScanResult } from "../types.js";
import {
  normalizeDevRoots,
  readAnkuiConfig,
  writeAnkuiConfig
} from "../config/ankui-config.js";
import { loadAllScans, readDevRootsConfig } from "../scanner/multi-project.js";
import { hasSensitivePathSegment } from "../scanner/safety.js";
import { disableSkill, enableSkill } from "../writer/index.js";
import { applyActions, type ActionRequest } from "./actions.js";
import { authorize } from "./security.js";
import { serveStatic } from "./static.js";
import { readRegistry } from "../bundles/registry.js";
import { checkBundleUpdate } from "../bundles/check.js";
import { runUpdateCommand } from "../commands/update.js";

export interface RouteContext {
  token: string;
  /** The server's own canonical origin; set after the server starts listening. */
  expectedOrigin: string;
  /**
   * All loopback origins this server answers on (127.0.0.1, localhost, [::1]).
   * Used by both the Host guard and the Origin guard so they can't drift.
   * Set after the server starts listening.
   */
  allowedOrigins: ReadonlySet<string>;
  homeDir: string;
  env: Record<string, string | undefined>;
  /** Test seam — defaults to a real multi-project scan. */
  loadScan?: () => Promise<MultiProjectScanResult>;
  /** Test seam — overrides the built SPA directory. */
  spaDir?: string;
}

/**
 * Returns every loopback origin the server should answer on. The Host guard
 * already accepts these three aliases as Host headers, so writes from a page
 * loaded on any of them need their Origin to be accepted too — otherwise
 * `http://localhost:<port>` and `http://[::1]:<port>` load the SPA but fail
 * every POST with 403.
 */
export function buildAllowedLoopbackOrigins(canonical: string): Set<string> {
  const u = new URL(canonical);
  const port = u.port;
  const protocol = u.protocol;
  return new Set([
    canonical,
    `${protocol}//127.0.0.1:${port}`,
    `${protocol}//localhost:${port}`,
    `${protocol}//[::1]:${port}`
  ]);
}

const MAX_BODY_BYTES = 1_000_000;

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): Promise<void> {
  // DNS rebinding guard: reject any request whose Host header doesn't match
  // a loopback alias of the bound origin. A malicious page that rebinds DNS
  // to 127.0.0.1 still sends its own Host header, which lands here.
  if (!isHostAllowed(req, ctx.allowedOrigins)) {
    res.writeHead(421, { "content-type": "text/plain; charset=utf-8" });
    res.end("misdirected request");
    return;
  }

  const url = req.url ?? "/";
  const method = (req.method ?? "GET").toUpperCase();
  const pathOnly = url.split("?")[0];

  if (pathOnly === "/api/scan") {
    const auth = authorize(req, ctx);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.message });
    if (method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
    return sendJson(res, 200, await loadScan(ctx));
  }

  if (pathOnly === "/api/actions") {
    const auth = authorize(req, ctx);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.message });
    if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    const changes = parseChanges(parsed);
    if (!changes) return sendJson(res, 400, { error: "invalid changes payload" });

    // Serialize concurrent action batches. Without this lock, two browser
    // tabs (or a double-clicked save) hit applyActions in parallel: both
    // call loadScan() and see the same on-disk state, both try to rename
    // the same skill dir, and the second rename surfaces a noisy
    // target_exists error to the user. With the lock, the second batch
    // sees the post-write state and reports "already in desired state".
    const result = await withActionsLock(() =>
      applyActions(changes, {
        loadScan: () => loadScan(ctx),
        disableSkill,
        enableSkill,
        homeDir: ctx.homeDir
      })
    );
    return sendJson(res, 200, result);
  }

  if (pathOnly === "/api/config") {
    const auth = authorize(req, ctx);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.message });
    if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    const payload = parseConfigPayload(parsed);
    if (!payload) return sendJson(res, 400, { error: "invalid devRoots payload" });

    // Validate the *desired* list before touching disk so a token-bearing
    // browser tab can't pin scans to arbitrary system paths (~/.ssh, /etc,
    // strings with control characters, etc.). Discovery downstream calls
    // fs.readdir on each devRoot without going through the scanner safety
    // layer, so any string accepted here gets enumerated.
    const desiredNormalized = normalizeDevRoots(payload.desired);
    const validation = validateDevRoots(desiredNormalized);
    if (!validation.ok) {
      return sendJson(res, 400, {
        error: `invalid devRoot at index ${validation.index}: ${validation.reason}`
      });
    }

    // Optimistic concurrency under a per-process mutex so two concurrent
    // /api/config requests can't both pass the same on-disk check and then
    // overwrite each other. The client's `expected` is the dev-root list it
    // saw in the last scan; we normalize it before comparing because the
    // scan endpoint returns the raw on-disk list while readAnkuiConfig
    // returns a normalized one — without this both would always disagree
    // for any config that contains whitespace-padded entries or dupes.
    const expectedNormalized = normalizeDevRoots(payload.expected);
    return await withConfigLock(async () => {
      const existing = await readAnkuiConfig(ctx.homeDir);
      if (!sameDevRoots(existing.config.devRoots, expectedNormalized)) {
        const scan = await loadScan(ctx);
        return sendJson(res, 409, {
          error: "config changed on disk; refresh and try again",
          scan
        });
      }

      await writeAnkuiConfig(
        { version: 1, devRoots: desiredNormalized },
        ctx.homeDir
      );
      const scan = await loadScan(ctx);
      return sendJson(res, 200, { scan });
    });
  }

  if (pathOnly === "/api/bundles/check") {
    const auth = authorize(req, ctx);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.message });
    if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    const name = (parsed as { name?: unknown }).name;
    if (typeof name !== "string") return sendJson(res, 400, { error: "name required" });
    const result = await withBundleLock(() => checkBundleUpdate({ name, homeDir: ctx.homeDir }));
    if (result.status === "not_found") return sendJson(res, 404, { error: "bundle not found" });
    return sendJson(res, 200, result);
  }

  if (pathOnly === "/api/bundles/update") {
    const auth = authorize(req, ctx);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.message });
    if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }
    const name = (parsed as { name?: unknown }).name;
    const expectedSha = (parsed as { expectedSha?: unknown }).expectedSha;
    if (typeof name !== "string" || typeof expectedSha !== "string") {
      return sendJson(res, 400, { error: "name and expectedSha required" });
    }
    const outcome = await withBundleLock(async () => {
      const reg = await readRegistry(ctx.homeDir);
      const entry = reg.bundles.find((b) => b.name === name);
      if (!entry) return { status: 404 as const };
      if (entry.pinnedSha !== expectedSha) {
        return { status: 409 as const, body: { error: "bundle changed on disk; refresh and try again" } };
      }
      const cmd = await runUpdateCommand({ name, flags: { yes: true }, homeDir: ctx.homeDir, cwd: ctx.homeDir });
      const scan = await loadScan(ctx);
      return { status: 200 as const, body: { exitCode: cmd.exitCode, stdout: cmd.stdout, stderr: cmd.stderr, scan } };
    });
    if (outcome.status === 404) return sendJson(res, 404, { error: "bundle not found" });
    if (outcome.status === 409) return sendJson(res, 409, outcome.body);
    return sendJson(res, 200, outcome.body);
  }

  const asset = await serveStatic(url, ctx.token, ctx.spaDir);
  res.writeHead(asset.status, { "content-type": asset.contentType });
  res.end(asset.body);
}

async function loadScan(
  ctx: RouteContext
): Promise<MultiProjectScanResult> {
  if (ctx.loadScan) return ctx.loadScan();
  // Web has no first-run wizard like the TUI does, so we can't reuse
  // buildLaunchTuiResult's empty-shortcut for empty devRoots — that would
  // hide every user-scope tool from a first-time web user. Always do a
  // full scan; loadAllScans handles user-scope regardless of devRoots.
  const config = await readDevRootsConfig(ctx.homeDir);
  const scan = await loadAllScans({
    devRoots: config.devRoots,
    homeDir: ctx.homeDir,
    env: ctx.env
  });
  // Surface config-read warnings (missing/unreadable/malformed
  // ~/.config/ankui/config.json) so the Doctor view can flag a first-run or
  // parse-error state. loadAllScans only sees devRoots — not why the list is
  // empty — so without this the actionable warning would be lost.
  if (config.warnings.length === 0) return scan;
  return { ...scan, warnings: [...config.warnings, ...scan.warnings] };
}

function parseConfigPayload(
  body: unknown
): { expected: string[]; desired: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const expected = parseStringArray((body as { expected?: unknown }).expected);
  const desired = parseStringArray((body as { desired?: unknown }).desired);
  if (!expected || !desired) return null;
  return { expected, desired };
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    out.push(entry);
  }
  return out;
}

const MAX_DEV_ROOT_CHARS = 4096;

function validateDevRoot(value: string): string | null {
  if (value.length > MAX_DEV_ROOT_CHARS) return "path too long";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "contains control character";
  if (!path.isAbsolute(value)) return "must be an absolute path";
  if (hasSensitivePathSegment(value)) return "contains a sensitive path segment";
  return null;
}

function validateDevRoots(
  values: readonly string[]
): { ok: true } | { ok: false; index: number; reason: string } {
  for (let i = 0; i < values.length; i++) {
    const reason = validateDevRoot(values[i]);
    if (reason) return { ok: false, index: i, reason };
  }
  return { ok: true };
}

function sameDevRoots(a: readonly string[], b: readonly string[]): boolean {
  // Order-sensitive: dev-root order drives discovery + display order in the
  // scanner, and writeAnkuiConfig preserves insertion order. An out-of-band
  // edit that only reorders the list is a real change the client must reconcile.
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// Per-process serialization for the read/compare/write sequence on
// ~/.config/ankui/config.json. Doesn't protect against a CLI write landing
// during the critical section — that would need OS file locking — but
// closes the in-server race where two browser tabs race the same edit.
let configLock: Promise<unknown> = Promise.resolve();

function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = configLock;
  const next = previous.then(fn, fn);
  configLock = next.catch(() => undefined);
  return next;
}

// Mirror of configLock for /api/actions. Same in-server scope: closes the
// race where two concurrent batches each read pre-write state and step on
// each other's skill-dir renames.
let actionsLock: Promise<unknown> = Promise.resolve();

function withActionsLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = actionsLock;
  const next = previous.then(fn, fn);
  actionsLock = next.catch(() => undefined);
  return next;
}

// Mirror of configLock/actionsLock for /api/bundles/*. Closes the in-server
// race where a check and an update (or two updates) interleave and end up
// reading or writing the registry concurrently. The CLI's own withRegistryLock
// guards the on-disk write, but this lock also serializes the surrounding
// fetch/diff/checkout sequence so the response payload is consistent.
let bundleLock: Promise<unknown> = Promise.resolve();

function withBundleLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = bundleLock;
  const next = previous.then(fn, fn);
  bundleLock = next.catch(() => undefined);
  return next;
}

function isHostAllowed(
  req: IncomingMessage,
  allowedOrigins: ReadonlySet<string>
): boolean {
  const host = req.headers.host;
  if (typeof host !== "string") return false;
  for (const origin of allowedOrigins) {
    if (new URL(origin).host === host) return true;
  }
  return false;
}

function parseChanges(body: unknown): ActionRequest[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) return null;
  const changes: ActionRequest[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const skillId = (entry as { skillId?: unknown }).skillId;
    const action = (entry as { action?: unknown }).action;
    if (typeof skillId !== "string") return null;
    if (action !== "disable" && action !== "enable") return null;
    changes.push({ skillId, action });
  }
  return changes;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}
