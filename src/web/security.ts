import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";

/** A fresh, unguessable per-process session token. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface AuthContext {
  /** The live session token. */
  token: string;
  /** The server's own origin, e.g. "http://127.0.0.1:7373". */
  expectedOrigin: string;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Authorizes an `/api/*` request.
 *
 * Every request must carry the session token in `x-ankui-token`. A
 * cross-origin page in the same browser cannot read this token (it lives in
 * the same-origin Ankui page, walled off by the same-origin policy), so it
 * cannot forge an authorized request. Mutating requests (anything other than
 * GET/HEAD) must additionally carry an `Origin` header equal to the server's
 * own origin — the browser sets `Origin` and a page script cannot spoof it,
 * which blocks localhost CSRF even if the token somehow leaked.
 */
export function authorize(
  req: IncomingMessage,
  ctx: AuthContext
): AuthResult {
  const header = req.headers["x-ankui-token"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !timingSafeEqual(provided, ctx.token)) {
    return { ok: false, status: 401, message: "missing or invalid token" };
  }

  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers["origin"];
    if (origin !== ctx.expectedOrigin) {
      return { ok: false, status: 403, message: "bad origin" };
    }
  }

  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
