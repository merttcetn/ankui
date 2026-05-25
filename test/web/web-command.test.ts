import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { runWebCommand } from "../../src/commands/web.js";

test("runWebCommand starts a loopback server and prints its URL", async () => {
  const lines: string[] = [];
  const handle = await runWebCommand({
    port: 0,
    open: false,
    homeDir: os.tmpdir(),
    env: {},
    write: (chunk) => lines.push(chunk)
  });
  try {
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.ok(lines.join("").includes(handle.url));
    // The SPA bundle is not built yet at this point in the plan, so the
    // static handler answers 503 ("not built"). Either way the server is
    // up and routed — that is what this test asserts.
    const res = await fetch(handle.url);
    assert.ok([200, 503].includes(res.status));
  } finally {
    await handle.close();
  }
});
