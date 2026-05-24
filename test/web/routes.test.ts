import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { createWebServer } from "../../src/web/server.js";
import { handleRequest, type RouteContext } from "../../src/web/routes.js";
import { TOKEN_PLACEHOLDER } from "../../src/web/static.js";
import type { MultiProjectScanResult } from "../../src/types.js";

function rawHttpGet(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: u.hostname,
        port: Number(u.port),
        path: u.pathname,
        method: "GET",
        headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

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

test("GET /api/scan surfaces config-read warnings (missing config)", async () => {
  // Regression: dropping config.warnings on the web path hides first-run /
  // parse-error states from the Doctor view. Exercise the real loadScan
  // (no ctx.loadScan stub) against a home dir without ~/.config/ankui/config.json
  // and verify the not_found warning makes it into the response.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-scan-warn-"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/scan`, {
      headers: { "x-ankui-token": ctx.token }
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as MultiProjectScanResult;
    const notFound = json.warnings.find(
      (w) =>
        w.reason === "not_found" &&
        typeof w.path === "string" &&
        w.path.endsWith("/.config/ankui/config.json")
    );
    assert.ok(notFound, "expected not_found warning for missing config.json");
  } finally {
    await handle.close();
  }
});

test("GET /api/scan surfaces config-read warnings (malformed config)", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-scan-warn-"));
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    "{not json",
    "utf8"
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/scan`, {
      headers: { "x-ankui-token": ctx.token }
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as MultiProjectScanResult;
    const parseFailed = json.warnings.find((w) => w.reason === "parse_failed");
    assert.ok(parseFailed, "expected parse_failed warning for malformed config.json");
  } finally {
    await handle.close();
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

test("POST /api/config needs token + matching Origin", async () => {
  const s = await startServer();
  try {
    const noToken = await fetch(`${s.url}/api/config`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: s.url },
      body: JSON.stringify({ expected: [], desired: [] })
    });
    assert.equal(noToken.status, 401);

    const badOrigin = await fetch(`${s.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: "https://evil.example"
      },
      body: JSON.stringify({ expected: [], desired: [] })
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await s.close();
  }
});

test("POST /api/config rejects a malformed body with 400", async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: s.url
      },
      body: "{not json"
    });
    assert.equal(res.status, 400);

    const wrongShape = await fetch(`${s.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": s.token,
        "content-type": "application/json",
        origin: s.url
      },
      body: JSON.stringify({ expected: "nope", desired: [] })
    });
    assert.equal(wrongShape.status, 400);
  } finally {
    await s.close();
  }
});

test("POST /api/config writes config and returns a fresh scan", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cfg-"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": ctx.token,
        "content-type": "application/json",
        origin: handle.url
      },
      body: JSON.stringify({ expected: [], desired: ["/tmp/dev-root-x"] })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.scan);

    const written = await fs.readFile(
      path.join(home, ".config", "ankui", "config.json"),
      "utf8"
    );
    const parsed = JSON.parse(written);
    assert.deepEqual(parsed.devRoots, ["/tmp/dev-root-x"]);
  } finally {
    await handle.close();
  }
});

test("POST /api/config returns 409 when on-disk state has drifted", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cfg-"));
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/tmp/already-on-disk"] }),
    "utf8"
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": ctx.token,
        "content-type": "application/json",
        origin: handle.url
      },
      body: JSON.stringify({ expected: [], desired: ["/tmp/something-else"] })
    });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /changed on disk/);
    assert.ok(json.scan);

    const written = await fs.readFile(
      path.join(home, ".config", "ankui", "config.json"),
      "utf8"
    );
    const parsed = JSON.parse(written);
    assert.deepEqual(parsed.devRoots, ["/tmp/already-on-disk"]);
  } finally {
    await handle.close();
  }
});

test("POST /api/config returns 409 when on-disk only reordered the same entries", async () => {
  // dev-root order is meaningful (drives display + project discovery order),
  // so an out-of-band reorder is a real drift that must trigger 409 instead
  // of being silently overwritten.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cfg-"));
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/tmp/b", "/tmp/a"] }),
    "utf8"
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": ctx.token,
        "content-type": "application/json",
        origin: handle.url
      },
      body: JSON.stringify({
        expected: ["/tmp/a", "/tmp/b"],
        desired: ["/tmp/a", "/tmp/b", "/tmp/c"]
      })
    });
    assert.equal(res.status, 409);

    const written = await fs.readFile(
      path.join(home, ".config", "ankui", "config.json"),
      "utf8"
    );
    const parsed = JSON.parse(written);
    assert.deepEqual(parsed.devRoots, ["/tmp/b", "/tmp/a"]);
  } finally {
    await handle.close();
  }
});

test("POST /api/config accepts a non-normalized expected list", async () => {
  // The scan endpoint returns the raw devRoots from readDevRootsConfig,
  // but /api/config reads through readAnkuiConfig which normalizes
  // (trims, dedupes, drops empties). Without normalizing `expected` on
  // the server side, a user whose config has whitespace-padded or
  // duplicate entries would be stuck on 409 forever and unable to repair
  // the config via the web UI.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cfg-"));
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    JSON.stringify({ version: 1, devRoots: ["  /tmp/a  ", "/tmp/a", "", "/tmp/b"] }),
    "utf8"
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const res = await fetch(`${handle.url}/api/config`, {
      method: "POST",
      headers: {
        "x-ankui-token": ctx.token,
        "content-type": "application/json",
        origin: handle.url
      },
      body: JSON.stringify({
        expected: ["  /tmp/a  ", "/tmp/a", "", "/tmp/b"],
        desired: ["/tmp/a", "/tmp/c"]
      })
    });
    assert.equal(res.status, 200);
    const written = JSON.parse(
      await fs.readFile(
        path.join(home, ".config", "ankui", "config.json"),
        "utf8"
      )
    );
    assert.deepEqual(written.devRoots, ["/tmp/a", "/tmp/c"]);
  } finally {
    await handle.close();
  }
});

test("two concurrent POST /api/config requests cannot lose-update each other", async () => {
  // Without the per-process lock around read+compare+write, two requests
  // sharing the same `expected` baseline can both pass sameDevRoots and
  // race the write — the later writer silently overwrites the earlier one.
  // With the lock, the second request reads the post-write state and
  // gets 409, surfacing the conflict to the user.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-cfg-"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-routes-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script>`,
    "utf8"
  );
  const ctx: RouteContext = {
    token: "test-token-abc",
    expectedOrigin: "",
    homeDir: home,
    env: {},
    loadScan: async () => emptyResult(),
    spaDir: dir
  };
  const handle = await createWebServer({
    port: 0,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = handle.url;
  try {
    const post = (desired: string[]): Promise<Response> =>
      fetch(`${handle.url}/api/config`, {
        method: "POST",
        headers: {
          "x-ankui-token": ctx.token,
          "content-type": "application/json",
          origin: handle.url
        },
        body: JSON.stringify({ expected: [], desired })
      });
    const [first, second] = await Promise.all([
      post(["/tmp/first"]),
      post(["/tmp/second"])
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const written = JSON.parse(
      await fs.readFile(
        path.join(home, ".config", "ankui", "config.json"),
        "utf8"
      )
    );
    // Exactly one of the desired values won; the other was rejected, not
    // silently overwritten.
    assert.equal(written.devRoots.length, 1);
    assert.ok(
      written.devRoots[0] === "/tmp/first" ||
        written.devRoots[0] === "/tmp/second"
    );
  } finally {
    await handle.close();
  }
});

test("requests with a mismatched Host header are rejected with 421", async () => {
  const s = await startServer();
  try {
    // Browsers send Host: <site-that-rebound-to-127.0.0.1>:port — emulate via
    // raw http.request because fetch() refuses to override the Host header.
    const apiRes = await rawHttpGet(`${s.url}/api/scan`, {
      "x-ankui-token": s.token,
      host: "evil.example"
    });
    assert.equal(apiRes.status, 421);

    const staticRes = await rawHttpGet(s.url, { host: "evil.example" });
    assert.equal(staticRes.status, 421);
  } finally {
    await s.close();
  }
});

test("endpoints reject the wrong HTTP method with 405", async () => {
  const s = await startServer();
  try {
    const cases: Array<{ url: string; method: string }> = [
      { url: "/api/scan", method: "POST" },
      { url: "/api/actions", method: "GET" },
      { url: "/api/config", method: "GET" }
    ];
    for (const c of cases) {
      const res = await fetch(`${s.url}${c.url}`, {
        method: c.method,
        headers: { "x-ankui-token": s.token, origin: s.url }
      });
      assert.equal(res.status, 405, `${c.method} ${c.url}`);
    }
  } finally {
    await s.close();
  }
});

test("POST /api/actions rejects malformed change entries with 400", async () => {
  const s = await startServer();
  try {
    const bodies: unknown[] = [
      { changes: [null] },
      { changes: [{ skillId: 42, action: "disable" }] },
      { changes: [{ skillId: "x", action: "delete" }] }
    ];
    for (const body of bodies) {
      const res = await fetch(`${s.url}/api/actions`, {
        method: "POST",
        headers: {
          "x-ankui-token": s.token,
          "content-type": "application/json",
          origin: s.url
        },
        body: JSON.stringify(body)
      });
      assert.equal(res.status, 400);
    }
  } finally {
    await s.close();
  }
});
