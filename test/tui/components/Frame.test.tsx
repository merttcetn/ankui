import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

import { Frame } from "../../../src/tui/components/Frame.js";

test("Frame renders heavy corner glyphs and wraps children", () => {
  const { lastFrame } = render(
    <Frame>
      <Text>hello</Text>
    </Frame>
  );
  const frame = lastFrame() ?? "";

  // Top corners
  assert.ok(frame.includes("┏"), "expected ┏ in frame");
  assert.ok(frame.includes("┓"), "expected ┓ in frame");
  // Bottom corners
  assert.ok(frame.includes("┗"), "expected ┗ in frame");
  assert.ok(frame.includes("┛"), "expected ┛ in frame");
  // Heavy horizontal segments
  assert.ok(frame.includes("━"), "expected ━ in frame");
  // Heavy vertical segments
  assert.ok(frame.includes("┃"), "expected ┃ in frame");
  // Children rendered inside
  assert.ok(frame.includes("hello"), "expected child text inside frame");
});

test("Frame renders without children (empty inner area)", () => {
  const { lastFrame } = render(<Frame>{null}</Frame>);
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("┏"));
  assert.ok(frame.includes("┛"));
});
