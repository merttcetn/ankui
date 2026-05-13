import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { Spinner } from "../../../src/tui/components/Spinner.js";
import { SPINNER_FRAMES } from "../../../src/tui/theme/icons.js";

test("Spinner renders the requested frame", () => {
  for (let i = 0; i < SPINNER_FRAMES.length; i++) {
    const { lastFrame } = render(<Spinner frame={i} />);
    const frame = lastFrame() ?? "";
    assert.ok(
      frame.includes(SPINNER_FRAMES[i]),
      `expected frame ${i} to include ${SPINNER_FRAMES[i]}`
    );
  }
});

test("Spinner clamps frame to the valid range using modulo", () => {
  const { lastFrame: a } = render(<Spinner frame={12} />);
  // 12 % 10 = 2 → SPINNER_FRAMES[2]
  assert.ok((a() ?? "").includes(SPINNER_FRAMES[2]));

  const { lastFrame: b } = render(<Spinner frame={-1} />);
  // -1 mod 10 in JS-safe form = 9
  assert.ok((b() ?? "").includes(SPINNER_FRAMES[9]));
});

test("Spinner accepts an optional label rendered after the glyph", () => {
  const { lastFrame } = render(<Spinner frame={0} label="Remembering..." />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes(SPINNER_FRAMES[0]));
  assert.ok(frame.includes("Remembering..."));
});
