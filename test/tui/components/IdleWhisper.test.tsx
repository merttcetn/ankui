import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { IdleWhisper } from "../../../src/tui/components/IdleWhisper.js";

test("IdleWhisper renders the whisper text when provided", () => {
  const inst = render(<IdleWhisper whisper="anghkooey." />);
  assert.match(inst.lastFrame() ?? "", /anghkooey\./);
  inst.unmount();
});

test("IdleWhisper renders nothing when whisper is null", () => {
  const inst = render(<IdleWhisper whisper={null} />);
  assert.doesNotMatch(inst.lastFrame() ?? "", /anghkooey/);
  inst.unmount();
});
