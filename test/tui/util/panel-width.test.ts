import assert from "node:assert/strict";
import test from "node:test";

import { computePanelWidth } from "../../../src/tui/util/panel-width.js";

test("computePanelWidth: 80-col terminal -> 52 content cols", () => {
  assert.equal(computePanelWidth(80), 52);
});

test("computePanelWidth: 120-col terminal -> 92 content cols", () => {
  assert.equal(computePanelWidth(120), 92);
});

test("computePanelWidth: 50-col narrow terminal floors at MIN_PANEL_WIDTH=32", () => {
  assert.equal(computePanelWidth(50), 32);
});

test("computePanelWidth: matches the documented formula columns - 28 above the floor", () => {
  for (const cols of [80, 96, 120, 160]) {
    assert.equal(computePanelWidth(cols), cols - 28);
  }
});

test("computePanelWidth: extremely narrow terminal still returns the floor (defensive)", () => {
  assert.equal(computePanelWidth(0), 32);
  assert.equal(computePanelWidth(-100), 32);
});
