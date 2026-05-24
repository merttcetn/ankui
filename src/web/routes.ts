import type { IncomingMessage, ServerResponse } from "node:http";

import type { MultiProjectScanResult } from "../types.js";
import {
  normalizeDevRoots,
  readAnkuiConfig,
  writeAnkuiConfig
} from "../config/ankui-config.js";
import { loadAllScans, readDevRootsConfig } from "../scanner/multi-project.js";
import { disableSkill, enableSkill } from "../writer/index.js";
import { applyActions, type ActionRequest } from "./actions.js";
import { authorize } from "./security.js";
import { serveStatic } from "./static.js";

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

    const result = await applyActions(changes, {
      loadScan: () => loadScan(ctx),
      disableSkill,
      enableSkill,
      homeDir: ctx.homeDir
    });
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
        { version: 1, devRoots: payload.desired },
        ctx.homeDir
      );
      const scan = await loadScan(ctx);
      return sendJson(res, 200, { scan });
    });
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
