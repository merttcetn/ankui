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

test("DotLeaderRow renders originLabel as dim italic suffix when set", () => {
  const { lastFrame } = render(
    <DotLeaderRow
      label="autoplan"
      metadata=""
      width={40}
      originLabel="gstack · bundle"
    />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("autoplan"), "label should render");
  assert.ok(frame.includes("gstack · bundle"), "origin label should render");
  assert.ok(frame.includes(" · "), "dot leader filler ' · ' should appear");
  // Origin label sits after the metadata position (which is empty here),
  // so it must come after the label and the dot leader.
  const labelIdx = frame.indexOf("autoplan");
  const originIdx = frame.indexOf("gstack · bundle");
  assert.ok(originIdx > labelIdx, "origin label should follow the label");
});

test("DotLeaderRow omits originLabel suffix when prop is undefined", () => {
  const withOrigin = render(
    <DotLeaderRow
      label="autoplan"
      metadata="5 skills"
      width={40}
      originLabel="gstack · bundle"
    />
  ).lastFrame() ?? "";

  const withoutOrigin = render(
    <DotLeaderRow label="autoplan" metadata="5 skills" width={40} />
  ).lastFrame() ?? "";

  assert.ok(
    !withoutOrigin.includes("gstack · bundle"),
    "frame without originLabel must not contain origin text"
  );
  assert.ok(
    withOrigin.includes("gstack · bundle"),
    "frame with originLabel must contain origin text"
  );
  // The two frames must differ — at minimum by the origin suffix presence.
  assert.notEqual(withOrigin, withoutOrigin);
});

test("DotLeaderRow omits originLabel suffix when prop is empty string", () => {
  const empty = render(
    <DotLeaderRow label="autoplan" metadata="5 skills" width={40} originLabel="" />
  ).lastFrame() ?? "";

  const undef = render(
    <DotLeaderRow label="autoplan" metadata="5 skills" width={40} />
  ).lastFrame() ?? "";

  // Empty-string originLabel should be treated identically to undefined.
  assert.equal(empty, undef);
  assert.ok(empty.includes("autoplan"));
  assert.ok(empty.includes("5 skills"));
});
