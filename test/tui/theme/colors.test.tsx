import assert from "node:assert/strict";
import test from "node:test";

import { colorForAccessLevel } from "../../../src/tui/theme/colors.js";

test("colorForAccessLevel maps broad to red", () => {
  assert.equal(colorForAccessLevel("broad"), "red");
});

test("colorForAccessLevel maps moderate to cyan", () => {
  assert.equal(colorForAccessLevel("moderate"), "cyan");
});

test("colorForAccessLevel maps limited to undefined (terminal default)", () => {
  assert.equal(colorForAccessLevel("limited"), undefined);
});

test("colorForAccessLevel maps unknown to gray", () => {
  assert.equal(colorForAccessLevel("unknown"), "gray");
});
