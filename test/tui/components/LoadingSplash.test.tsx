import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { LoadingSplash } from "../../../src/tui/components/LoadingSplash.js";

test("LoadingSplash renders the initial message 'Remembering...'", () => {
  const inst = render(<LoadingSplash active={true} intervalMs={1_000_000} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Remembering\.\.\./);
  inst.unmount();
});

test("LoadingSplash shows a progress percentage when percent prop is provided", () => {
  const inst = render(
    <LoadingSplash active={true} intervalMs={1_000_000} percent={47} />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /47/);
  inst.unmount();
});

test("LoadingSplash renders the final 'Remembered.' label when active is false and completed is true", () => {
  const inst = render(<LoadingSplash active={false} completed={true} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Remembered\./);
  inst.unmount();
});

test("LoadingSplash renders a braille spinner frame while active", () => {
  const inst = render(<LoadingSplash active={true} intervalMs={1_000_000} />);
  const frame = inst.lastFrame() ?? "";
  // Any one of the braille frames
  assert.match(frame, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  inst.unmount();
});
