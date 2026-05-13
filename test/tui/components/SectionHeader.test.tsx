import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { SectionHeader } from "../../../src/tui/components/SectionHeader.js";

test("SectionHeader renders the label uppercased with spaced letters", () => {
  const { lastFrame } = render(<SectionHeader label="overview" />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("O V E R V I E W"));
});

test("SectionHeader renders a light horizontal underline below the label", () => {
  const { lastFrame } = render(<SectionHeader label="claude" underlineWidth={10} />);
  const frame = lastFrame() ?? "";
  // Exactly 10 ─ glyphs in sequence
  assert.ok(frame.includes("──────────"));
  assert.ok(frame.includes("C L A U D E"));
});

test("SectionHeader default underline width is 60", () => {
  const { lastFrame } = render(<SectionHeader label="x" />);
  const frame = lastFrame() ?? "";
  const matches = frame.match(/─+/g) ?? [];
  // The longest contiguous run of ─ is our underline.
  const longest = matches.reduce((acc, s) => (s.length > acc ? s.length : acc), 0);
  assert.equal(longest, 60);
});

test("SectionHeader spaced uppercase preserves digits and hyphens", () => {
  const { lastFrame } = render(<SectionHeader label="user-scope-1" />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("U S E R - S C O P E - 1"));
});
