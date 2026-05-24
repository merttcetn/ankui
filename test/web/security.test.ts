import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { authorize, generateToken } from "../../src/web/security.js";

const EXPECTED_ORIGIN = "http://127.0.0.1:7373";
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "http://127.0.0.1:7373",
  "http://localhost:7373",
  "http://[::1]:7373"
]);

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
    expectedOrigin: EXPECTED_ORIGIN,
    allowedOrigins: ALLOWED_ORIGINS
  });
  assert.equal(res.ok, true);
});

test("authorize rejects a missing token with 401", () => {
  const res = authorize(fakeReq("GET", {}), {
    token: generateToken(),
    expectedOrigin: EXPECTED_ORIGIN,
    allowedOrigins: ALLOWED_ORIGINS
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("authorize rejects a wrong token with 401", () => {
  const res = authorize(fakeReq("GET", { "x-ankui-token": "deadbeef" }), {
    token: generateToken(),
    expectedOrigin: EXPECTED_ORIGIN,
    allowedOrigins: ALLOWED_ORIGINS
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("authorize accepts a POST with token and matching Origin", () => {
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "http://127.0.0.1:7373" }),
    {
      token,
      expectedOrigin: EXPECTED_ORIGIN,
      allowedOrigins: ALLOWED_ORIGINS
    }
  );
  assert.equal(res.ok, true);
});

test("authorize accepts a POST with token and localhost loopback Origin", () => {
  // Regression: the Host guard accepts http://localhost:<port>, so the
  // browser's Origin on POSTs from a page opened there must also pass —
  // otherwise Actions/Settings saves fail with 403 even though the SPA loaded.
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "http://localhost:7373" }),
    {
      token,
      expectedOrigin: EXPECTED_ORIGIN,
      allowedOrigins: ALLOWED_ORIGINS
    }
  );
  assert.equal(res.ok, true);
});

test("authorize accepts a POST with token and [::1] loopback Origin", () => {
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "http://[::1]:7373" }),
    {
      token,
      expectedOrigin: EXPECTED_ORIGIN,
      allowedOrigins: ALLOWED_ORIGINS
    }
  );
  assert.equal(res.ok, true);
});

test("authorize rejects a POST with a mismatched Origin with 403", () => {
  const token = generateToken();
  const res = authorize(
    fakeReq("POST", { "x-ankui-token": token, origin: "https://evil.example" }),
    {
      token,
      expectedOrigin: EXPECTED_ORIGIN,
      allowedOrigins: ALLOWED_ORIGINS
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("authorize rejects a POST with no Origin with 403", () => {
  const token = generateToken();
  const res = authorize(fakeReq("POST", { "x-ankui-token": token }), {
    token,
    expectedOrigin: EXPECTED_ORIGIN,
    allowedOrigins: ALLOWED_ORIGINS
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});
