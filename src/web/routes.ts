import type { IncomingMessage, ServerResponse } from "node:http";

import type { MultiProjectScanResult } from "../types.js";
import { buildLaunchTuiResult } from "../commands/launch-tui.js";
import { mergeDevRoots, writeAnkuiConfig } from "../config/ankui-config.js";
import { disableSkill, enableSkill } from "../writer/index.js";
import { applyActions, type ActionRequest } from "./actions.js";
import { authorize } from "./security.js";
import { serveStatic } from "./static.js";

export interface RouteContext {
  token: string;
  /** The server's own origin; set after the server starts listening. */
  expectedOrigin: string;
  homeDir: string;
  env: Record<string, string | undefined>;
  /** Test seam — defaults to a real multi-project scan. */
  loadScan?: () => Promise<MultiProjectScanResult>;
  /** Test seam — overrides the built SPA directory. */
  spaDir?: string;
}

const MAX_BODY_BYTES = 1_000_000;

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): Promise<void> {
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
    const devRoots = parseDevRoots(parsed);
    if (!devRoots) return sendJson(res, 400, { error: "invalid devRoots payload" });

    await writeAnkuiConfig(
      { version: 1, devRoots: mergeDevRoots([], devRoots) },
      ctx.homeDir
    );
    const scan = await loadScan(ctx);
    return sendJson(res, 200, { scan });
  }

  const asset = await serveStatic(url, ctx.token, ctx.spaDir);
  res.writeHead(asset.status, { "content-type": asset.contentType });
  res.end(asset.body);
}

function loadScan(ctx: RouteContext): Promise<MultiProjectScanResult> {
  if (ctx.loadScan) return ctx.loadScan();
  return buildLaunchTuiResult({ homeDir: ctx.homeDir, env: ctx.env });
}

function parseDevRoots(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { devRoots?: unknown }).devRoots;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return null;
    out.push(entry);
  }
  return out;
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
