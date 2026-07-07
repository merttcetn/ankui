import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createWebServer } from "../../src/web/server.js";
import { buildAllowedLoopbackOrigins, handleRequest, type RouteContext } from "../../src/web/routes.js";
import { createAllEmptyTools, createScanSummary, type MultiProjectScanResult } from "../../src/types.js";

function emptyResult(homeDir: string): MultiProjectScanResult {
  const stamp = "2026-07-06T10:00:00.000Z";
  const tools = createAllEmptyTools();
  const scan = {
    scannedAt: stamp,
    cwd: homeDir,
    homeDir,
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
  return {
    scannedAt: stamp,
    cwd: homeDir,
    homeDir,
    devRoots: [],
    userScope: scan,
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

async function startSnapshotServer(): Promise<{
  url: string;
  token: string;
  close: () => Promise<void>;
}> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-snapshot-web-"));
  const ctx: RouteContext = {
    token: "snapshot-test-token",
    expectedOrigin: "",
    allowedOrigins: new Set(),
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(home)
  };
  const server = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = server.url;
  ctx.allowedOrigins = buildAllowedLoopbackOrigins(server.url);
  return { url: server.url, token: ctx.token, close: server.close };
}

test("snapshot web API requires auth and Origin for writes", async () => {
  const server = await startSnapshotServer();
  try {
    assert.equal((await fetch(`${server.url}/api/snapshots`)).status, 401);
    const badOrigin = await fetch(`${server.url}/api/snapshots`, {
      method: "POST",
      headers: {
        "x-ankui-token": server.token,
        "content-type": "application/json",
        origin: "https://example.com"
      },
      body: "{}"
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await server.close();
  }
});

test("snapshot web API creates, reads, lists, and deletes snapshots", async () => {
  const server = await startSnapshotServer();
  const auth = { "x-ankui-token": server.token };
  try {
    const createdResponse = await fetch(`${server.url}/api/snapshots`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", origin: server.url },
      body: JSON.stringify({ label: "web baseline" })
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { latest: { id: string; label: string }; diff: { summary: { total: number } } };
    assert.equal(created.latest.label, "web baseline");
    assert.equal(created.diff.summary.total, 0);

    const stateResponse = await fetch(`${server.url}/api/snapshot-state`, { headers: auth });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json() as { snapshots: Array<{ id: string }> };
    assert.equal(state.snapshots.length, 1);

    const documentResponse = await fetch(`${server.url}/api/snapshots/${created.latest.id}`, { headers: auth });
    assert.equal(documentResponse.status, 200);

    const deletedResponse = await fetch(`${server.url}/api/snapshots/${created.latest.id}`, {
      method: "DELETE",
      headers: { ...auth, origin: server.url }
    });
    assert.equal(deletedResponse.status, 200);
    const deletedState = await deletedResponse.json() as { snapshots: unknown[] };
    assert.equal(deletedState.snapshots.length, 0);
  } finally {
    await server.close();
  }
});

test("snapshot web API rejects invalid labels and traversal-shaped ids", async () => {
  const server = await startSnapshotServer();
  const auth = { "x-ankui-token": server.token };
  try {
    const labelResponse = await fetch(`${server.url}/api/snapshots`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", origin: server.url },
      body: JSON.stringify({ label: "x".repeat(81) })
    });
    assert.equal(labelResponse.status, 400);

    const traversal = await fetch(`${server.url}/api/snapshots/${encodeURIComponent("../secret")}`, { headers: auth });
    assert.equal(traversal.status, 404);
  } finally {
    await server.close();
  }
});
