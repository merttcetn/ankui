import assert from "node:assert/strict";
import test from "node:test";

import { relativizeHome } from "../../src/utils/paths.js";

test("relativizeHome rewrites a home-prefixed path as ~", () => {
  assert.equal(
    relativizeHome("/Users/me/.claude/skill.md", "/Users/me"),
    "~/.claude/skill.md"
  );
});

test("relativizeHome rewrites the homeDir itself as ~", () => {
  assert.equal(relativizeHome("/Users/me", "/Users/me"), "~");
});

test("relativizeHome leaves paths outside homeDir untouched", () => {
  assert.equal(relativizeHome("/etc/host", "/Users/me"), "/etc/host");
});

test("relativizeHome does not rewrite a path that only shares a homeDir prefix as substring", () => {
  assert.equal(
    relativizeHome("/Users/meredith/x", "/Users/me"),
    "/Users/meredith/x"
  );
});

test("relativizeHome returns the path unchanged when homeDir is empty", () => {
  assert.equal(relativizeHome("/anywhere", ""), "/anywhere");
});
