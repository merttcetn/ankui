import test from "node:test";
import assert from "node:assert/strict";

import { createWebServer } from "../../src/web/server.js";

test("createWebServer binds 127.0.0.1 and serves the handler", async () => {
  const handle = await createWebServer({
    port: 0,
    handler: (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pong");
    }
  });
  try {
    assert.equal(handle.host, "127.0.0.1");
    assert.ok(handle.port > 0);
    assert.equal(handle.url, `http://127.0.0.1:${handle.port}`);
    const res = await fetch(handle.url);
    assert.equal(await res.text(), "pong");
  } finally {
    await handle.close();
  }
});

test("createWebServer falls back to the next port when one is taken", async () => {
  const first = await createWebServer({
    port: 0,
    handler: (_req, res) => res.end("a")
  });
  try {
    const taken = first.port;
    const second = await createWebServer({
      port: taken,
      handler: (_req, res) => res.end("b")
    });
    try {
      assert.notEqual(second.port, taken);
      assert.ok(second.port >= taken && second.port <= taken + 20);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});
