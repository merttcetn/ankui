import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createWebServer } from "../../src/web/server.js";
import { handleRequest, type RouteContext } from "../../src/web/routes.js";
import { TOKEN_PLACEHOLDER } from "../../src/web/static.js";
import type { MultiProjectScanResult } from "../../src/types.js";

function emptyResult(): MultiProjectScanResult {
  const stamp = "2026-05-22T00:00:00.000Z";
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

async function startServer(): Promise<{
  url: string;
  token: string;
  close: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: "/home/u",
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  return { url: handle.url, token: ctx.token, close: handle.close };
}

test("GET / serves index.html with the token injected", async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.url);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /window\.T="test-token-abc"/);
  } finally {
    await s.close();
  }
});

test("GET /api/scan needs a token", async () => {
  const s = await startServer();
  try {
    const unauth = await fetch(`${s.url}/api/scan`);
    assert.equal(unauth.status, 401);

    const ok = await fetch(`${s.url}/api/scan`, {
      headers: { "x-ankui-token": s.token }
    });
    assert.equal(ok.status, 200);
    const json = await ok.json();
    assert.equal(json.userScope.tools.length, 0);
  } finally {
    await s.close();
  }
});

test("POST /api/actions needs token + matching Origin", async () => {
  const s = await startServer();
  try {
    const badOrigin = await fetch(`${s.url}/api/actions`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: "https://evil.example"
      },
      body: JSON.stringify({ changes: [] })
    });
    assert.equal(badOrigin.status, 403);

    const ok = await fetch(`${s.url}/api/actions`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: s.url
      },
      body: JSON.stringify({
        changes: [{ skillId: "nope", action: "disable" }]
      })
    });
    assert.equal(ok.status, 200);
    const json = await ok.json();
    assert.equal(json.outcomes[0].ok, false);
    assert.match(json.outcomes[0].message, /not found/);
  } finally {
    await s.close();
  }
});

test("POST /api/actions rejects a malformed body with 400", async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.url}/api/actions`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: s.url
      },
      body: "{not json"
    });
    assert.equal(res.status, 400);
  } finally {
    await s.close();
  }
});
