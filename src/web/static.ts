import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

/** The literal the built `index.html` carries; replaced per session. */
export const TOKEN_PLACEHOLDER = "__ANKUI_TOKEN_PLACEHOLDER__";

/**
 * Absolute path to the built SPA directory. This file runs from
 * `dist/web/static.js`, so the Vite bundle sits at the sibling `dist/web-ui`.
 */
export function spaDir(): string {
  return fileURLToPath(new URL("../web-ui", import.meta.url));
}

export interface StaticAsset {
  status: number;
  contentType: string;
  body: Buffer | string;
}

/**
 * Resolves a URL path to a built SPA asset. Real assets (paths with a known
 * file extension) are served directly; everything else falls back to
 * `index.html` so the SPA owns client-side routing. The served `index.html`
 * has the token placeholder swapped for the live session token.
 */
export async function serveStatic(
  urlPath: string,
  token: string,
  dir: string = spaDir()
): Promise<StaticAsset> {
  const root = path.resolve(dir);
  const clean = (urlPath.split("?")[0] ?? "/");
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const resolved = path.resolve(root, rel);

  // Path traversal guard — never serve outside the SPA root.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "not found" };
  }

  const ext = path.extname(resolved);
  if (ext && ext !== ".html" && MIME[ext]) {
    try {
      const body = await fs.readFile(resolved);
      return { status: 200, contentType: MIME[ext], body };
    } catch {
      // Missing asset — fall through to the index.html SPA fallback.
    }
  }

  try {
    const html = await fs.readFile(path.join(root, "index.html"), "utf8");
    return {
      status: 200,
      contentType: MIME[".html"],
      body: html.split(TOKEN_PLACEHOLDER).join(token)
    };
  } catch {
    return {
      status: 503,
      contentType: MIME[".html"],
      body:
        "<h1>Ankui web UI is not built</h1>" +
        "<p>Run <code>npm run build</code>, then start <code>ankui web</code> again.</p>"
    };
  }
}
