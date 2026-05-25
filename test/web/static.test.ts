import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { serveStatic, TOKEN_PLACEHOLDER } from "../../src/web/static.js";

async function tempSpaDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-web-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    `<!doctype html><script>window.T="${TOKEN_PLACEHOLDER}"</script><div id="root"></div>`,
    "utf8"
  );
  await fs.mkdir(path.join(dir, "assets"));
  await fs.writeFile(
    path.join(dir, "assets", "app.css"),
    "body{margin:0}",
    "utf8"
  );
  return dir;
}

test("serveStatic returns index.html with the token injected", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/", "tok123", dir);
  assert.equal(asset.status, 200);
  assert.match(asset.contentType, /text\/html/);
  assert.match(String(asset.body), /window\.T="tok123"/);
  assert.doesNotMatch(String(asset.body), new RegExp(TOKEN_PLACEHOLDER));
});

test("serveStatic serves a css asset with the right MIME type", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/assets/app.css", "tok123", dir);
  assert.equal(asset.status, 200);
  assert.match(asset.contentType, /text\/css/);
  assert.equal(String(asset.body), "body{margin:0}");
});

test("serveStatic falls back to index.html for unknown SPA routes", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/access", "tok123", dir);
  assert.equal(asset.status, 200);
  assert.match(asset.contentType, /text\/html/);
});

test("serveStatic blocks path traversal", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/../../../etc/passwd", "tok123", dir);
  assert.equal(asset.status, 404);
});

test("serveStatic blocks URL-encoded path traversal", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/%2e%2e%2f%2e%2e%2fetc%2fpasswd", "tok123", dir);
  assert.equal(asset.status, 404);
});

test("serveStatic rejects malformed percent-encoding", async () => {
  const dir = await tempSpaDir();
  const asset = await serveStatic("/%zz", "tok123", dir);
  assert.equal(asset.status, 404);
});

test("serveStatic returns 503 when the SPA is not built", async () => {
  const asset = await serveStatic(
    "/",
    "tok123",
    path.join(os.tmpdir(), "ankui-does-not-exist-xyz")
  );
  assert.equal(asset.status, 503);
  assert.match(String(asset.body), /not built/i);
});
