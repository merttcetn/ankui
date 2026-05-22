import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { authorize, generateToken } from "../../src/web/security.js";

function fakeReq(
  method: string,
  headers: Record<string, string>
): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage;
}

test("generateToken returns a unique 64-char hex string", () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("authorize accepts a GET with the correct token", () => {
  const token = generateToken();
  const res = authorize(fakeReq("GET", { "x-ankui-token": token }), {
    token,
    expectedOrigin: "http://127.0.0.1:7373"
  });
  assert.equal(res.ok, true);
});

test("authorize rejects a missing token with 401", () => {
  const res = authorize(fakeReq("GET", {}), {
    token: generateToken(),
    expectedOrigin: "http://127.0.0.1:7373"
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("authorize rejects a wrong token with 401", () => {
  const res = authorize(fakeReq("GET", { "x-ankui-token": "deadbeef" }), {
    token: generateToken(),
    expectedOrigin: "http://127.0.0.1:7373"
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("authorize accepts a POST with token and matching Origin", () => {
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "http://127.0.0.1:7373" }),
    { token, expectedOrigin: "http://127.0.0.1:7373" }
  );
  assert.equal(res.ok, true);
});

test("authorize rejects a POST with a mismatched Origin with 403", () => {
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "https://evil.example" }),
    { token, expectedOrigin: "http://127.0.0.1:7373" }
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("authorize rejects a POST with no Origin with 403", () => {
  const token = generateToken();
  const res = authorize(fakeReq("POST", { "x-ankui-token": token }), {
    token,
    expectedOrigin: "http://127.0.0.1:7373"
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});
