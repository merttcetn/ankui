import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { EmptyStateWhisper } from "../../../src/tui/components/EmptyStateWhisper.js";

test("EmptyStateWhisper renders provided text", () => {
  const inst = render(<EmptyStateWhisper text="the talismans are holding." />);
  assert.match(inst.lastFrame() ?? "", /the talismans are holding\./);
  inst.unmount();
});

test("EmptyStateWhisper renders empty fallback when text is empty", () => {
  const inst = render(<EmptyStateWhisper text="" />);
  assert.equal(typeof inst.lastFrame(), "string");
  inst.unmount();
});
