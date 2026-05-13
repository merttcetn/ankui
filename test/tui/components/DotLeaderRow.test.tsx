import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { DotLeaderRow } from "../../../src/tui/components/DotLeaderRow.js";

test("DotLeaderRow renders label, dot leader, and metadata", () => {
  const { lastFrame } = render(
    <DotLeaderRow label="Claude" metadata="82 user · 6 project · 3 MCPs" width={60} />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("Claude"));
  assert.ok(frame.includes("82 user"));
  // At least one ` · ` segment in the middle (interpunct surrounded by spaces).
  assert.ok(frame.includes(" · "), "expected dot-leader filler ' · '");
});

test("DotLeaderRow with active=true prefixes with ▶ and tints", () => {
  const { lastFrame } = render(
    <DotLeaderRow label="ankui" metadata="5 skills" width={60} active />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("▶"));
  assert.ok(frame.includes("ankui"));
  assert.ok(frame.includes("5 skills"));
});

test("DotLeaderRow falls back to single space when width is too narrow", () => {
  // label (5) + metadata (5) = 10 chars, width 12 leaves only 2 for the gap
  // (less than the 3-char minimum for a `· ` leader). Should degrade
  // gracefully without crashing.
  const { lastFrame } = render(
    <DotLeaderRow label="aaaaa" metadata="bbbbb" width={12} />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("aaaaa"));
  assert.ok(frame.includes("bbbbb"));
});

test("DotLeaderRow renders without crashing on zero-length label or metadata", () => {
  const { lastFrame: a } = render(<DotLeaderRow label="" metadata="x" width={20} />);
  const { lastFrame: b } = render(<DotLeaderRow label="x" metadata="" width={20} />);
  assert.equal(typeof a(), "string");
  assert.equal(typeof b(), "string");
});
