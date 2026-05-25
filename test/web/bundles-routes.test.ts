import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createWebServer } from "../../src/web/server.js";
import {
  buildAllowedLoopbackOrigins,
  handleRequest,
  type RouteContext
} from "../../src/web/routes.js";
import { TOKEN_PLACEHOLDER } from "../../src/web/static.js";
import { writeRegistry } from "../../src/bundles/registry.js";
import type { MultiProjectScanResult } from "../../src/types.js";

function emptyResult(): MultiProjectScanResult {
  const stamp = "2026-05-25T00:00:00.000Z";
  return {
    scannedAt: stamp,
    cwd: "/home/u",
    homeDir: "/home/u",
    devRoots: [],
    userScope: {
      scannedAt: stamp,
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: [],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 0,
        totalSkills: 0,
        totalMcpServers: 0,
        uniqueMcpServers: 0,
        customCommands: 0,
        customTools: 0,
        plugins: 0,
        memoryFiles: 0,
        agentSkills: 0,
        skillsShSkills: 0,
        totalFindings: 0,
        broadAccessFindings: 0
      }
    },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

async function startServer(home: string): Promise<{ url: string; token: string; close: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-spa-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    allowedOrigins: new Set<string>(),
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({ port: 0, handler: (req, res) => handleRequest(req, res, ctx) });
  ctx.expectedOrigin = handle.url;
  ctx.allowedOrigins = buildAllowedLoopbackOrigins(handle.url);
  return { url: handle.url, token: ctx.token, close: handle.close };
}

test("POST /api/bundles/check 404s when bundle name is not in registry", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-h-"));
  await writeRegistry(home, { version: 1, bundles: [] });
  const s = await startServer(home);
  try {
    const res = await fetch(`${s.url}/api/bundles/check`, {
      method: "POST",
      headers: { "x-ankui-token": s.token, "content-type": "application/json", origin: s.url },
      body: JSON.stringify({ name: "missing/repo" })
    });
    assert.equal(res.status, 404);
  } finally {
    await s.close();
  }
});

test("POST /api/bundles/check and /api/bundles/update enforce auth (token + Origin)", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-h-"));
  await writeRegistry(home, { version: 1, bundles: [] });
  const s = await startServer(home);
  try {
    const noToken = await fetch(`${s.url}/api/bundles/check`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: s.url },
      body: JSON.stringify({ name: "x" })
    });
    assert.equal(noToken.status, 401);

    const badOrigin = await fetch(`${s.url}/api/bundles/update`, {
      method: "POST",
      headers: { "x-ankui-token": s.token, "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ name: "x", expectedSha: "a".repeat(40) })
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await s.close();
  }
});

test("POST /api/bundles/update returns 404 for unknown bundle name", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-h-"));
  await writeRegistry(home, { version: 1, bundles: [] });
  const s = await startServer(home);
  try {
    const [a, b] = await Promise.all([
      fetch(`${s.url}/api/bundles/update`, {
        method: "POST",
        headers: { "x-ankui-token": s.token, "content-type": "application/json", origin: s.url },
        body: JSON.stringify({ name: "x", expectedSha: "a".repeat(40) })
      }),
      fetch(`${s.url}/api/bundles/update`, {
        method: "POST",
        headers: { "x-ankui-token": s.token, "content-type": "application/json", origin: s.url },
        body: JSON.stringify({ name: "x", expectedSha: "a".repeat(40) })
      })
    ]);
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
  } finally {
    await s.close();
  }
});

test("POST /api/bundles/check rejects non-POST methods", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-h-"));
  await writeRegistry(home, { version: 1, bundles: [] });
  const s = await startServer(home);
  try {
    const res = await fetch(`${s.url}/api/bundles/check`, {
      method: "GET",
      headers: { "x-ankui-token": s.token, origin: s.url }
    });
    assert.equal(res.status, 405);
  } finally {
    await s.close();
  }
});

test("POST /api/bundles/check rejects missing name in body", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-h-"));
  await writeRegistry(home, { version: 1, bundles: [] });
  const s = await startServer(home);
  try {
    const res = await fetch(`${s.url}/api/bundles/check`, {
      method: "POST",
      headers: { "x-ankui-token": s.token, "content-type": "application/json", origin: s.url },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
  } finally {
    await s.close();
  }
});
