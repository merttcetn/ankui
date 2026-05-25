import test from "node:test";
import assert from "node:assert/strict";

import { parseGitHubUrl } from "../../src/bundles/url.js";

test("parseGitHubUrl accepts canonical HTTPS GitHub URLs", () => {
  const r = parseGitHubUrl("https://github.com/foo/skills");
  assert.deepEqual(r, { url: "https://github.com/foo/skills", owner: "foo", repo: "skills", name: "foo/skills" });
});

test("parseGitHubUrl accepts trailing .git suffix", () => {
  const r = parseGitHubUrl("https://github.com/foo/skills.git");
  assert.equal(r.repo, "skills");
  assert.equal(r.name, "foo/skills");
});

test("parseGitHubUrl rejects SSH URLs", () => {
  assert.throws(() => parseGitHubUrl("git@github.com:foo/skills.git"), /HTTPS/);
});

test("parseGitHubUrl rejects http:// (no TLS)", () => {
  assert.throws(() => parseGitHubUrl("http://github.com/foo/skills"), /HTTPS/);
});

test("parseGitHubUrl rejects non-GitHub hosts", () => {
  assert.throws(() => parseGitHubUrl("https://gitlab.com/foo/skills"), /GitHub/);
});

test("parseGitHubUrl rejects malformed paths", () => {
  assert.throws(() => parseGitHubUrl("https://github.com/foo"), /owner\/repo/);
  assert.throws(() => parseGitHubUrl("https://github.com/"), /owner\/repo/);
});
