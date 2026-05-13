import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { ProgressBar } from "../../../src/tui/components/ProgressBar.js";

test("ProgressBar at value=0 renders all empty cells", () => {
  const { lastFrame } = render(<ProgressBar value={0} width={10} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("░░░░░░░░░░"));
  assert.equal(frame.includes("▊"), false);
});

test("ProgressBar at value=1 renders all full cells", () => {
  const { lastFrame } = render(<ProgressBar value={1} width={10} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("▊▊▊▊▊▊▊▊▊▊"));
  assert.equal(frame.includes("░"), false);
});

test("ProgressBar clamps value > 1 and value < 0", () => {
  const { lastFrame: a } = render(<ProgressBar value={5} width={4} />);
  assert.ok((a() ?? "").includes("▊▊▊▊"));

  const { lastFrame: b } = render(<ProgressBar value={-3} width={4} />);
  assert.ok((b() ?? "").includes("░░░░"));
});

test("ProgressBar at value=0.47 of width=26 emits 12 full cells + a sub-cell glyph", () => {
  const { lastFrame } = render(<ProgressBar value={0.47} width={26} />);
  const frame = lastFrame() ?? "";
  // 12 fully-filled cells
  assert.ok(
    frame.includes("▊".repeat(12)),
    `expected 12 ▊ cells in: ${JSON.stringify(frame)}`
  );
  // A partial sub-cell glyph from the eighths set (1/8 = ▏ for floor math)
  assert.ok(frame.includes("▏"));
});

test("ProgressBar at value=0.5 of width=10 emits 5 full and 5 empty cells", () => {
  // 0.5 * 10 * 8 = 40 eighths = exactly 5 cells, no partial.
  const { lastFrame } = render(<ProgressBar value={0.5} width={10} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("▊▊▊▊▊░░░░░"));
});
