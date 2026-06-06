import assert from "node:assert/strict";
import test from "node:test";

import {
  clipHint,
  computeAvailableContentRows,
  computePanelWidth
} from "../../../src/tui/util/panel-width.js";

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

// computeAvailableContentRows: chrome overhead is Frame top+bottom border (2)
// + KeyHint (1) + IdleWhisper (1) + 1 safety margin = 5. Floor at
// MIN_CONTENT_ROWS=6 so list clipping never collapses to zero on tiny
// terminals.

test("computeAvailableContentRows: 30-row terminal, no extra overhead -> 25", () => {
  assert.equal(computeAvailableContentRows(30), 25);
});

test("computeAvailableContentRows: 24-row tiny terminal -> 19", () => {
  assert.equal(computeAvailableContentRows(24), 19);
});

test("computeAvailableContentRows: floors at MIN_CONTENT_ROWS=6 on tiny terminals", () => {
  assert.equal(computeAvailableContentRows(5), 6);
  assert.equal(computeAvailableContentRows(0), 6);
  assert.equal(computeAvailableContentRows(-10), 6);
});

test("computeAvailableContentRows: extraOverhead subtracts from the budget", () => {
  assert.equal(computeAvailableContentRows(40, 10), 25);
});

test("computeAvailableContentRows: huge extraOverhead still floors at MIN", () => {
  assert.equal(computeAvailableContentRows(30, 100), 6);
});

test("clipHint: returns null when nothing is hidden", () => {
  assert.equal(clipHint(0), null);
  assert.equal(clipHint(-1), null);
});

test("clipHint: returns formatted hint when rows are hidden", () => {
  const hint = clipHint(7);
  assert.ok(hint);
  assert.match(hint, /\+7 more/);
  assert.match(hint, /resize/);
});
