import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { KeyHint } from "../../../src/tui/components/KeyHint.js";

test("KeyHint renders the provided hints joined with the dot separator", () => {
  const { lastFrame } = render(
    <KeyHint hints={["▲▼ navigate", "⏎ open", "esc back"]} />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("▲▼ navigate"));
  assert.ok(frame.includes("⏎ open"));
  assert.ok(frame.includes("esc back"));
  // Dot separator (interpunct) between hints
  assert.ok(frame.includes("·"));
});

test("KeyHint with a single hint renders no separator", () => {
  const { lastFrame } = render(<KeyHint hints={["q quit"]} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("q quit"));
  // Exactly zero interpuncts when there's only one hint.
  assert.equal(frame.match(/·/g)?.length ?? 0, 0);
});

test("KeyHint with empty hints array renders an empty line, no crash", () => {
  const { lastFrame } = render(<KeyHint hints={[]} />);
  assert.equal(typeof lastFrame(), "string");
});
