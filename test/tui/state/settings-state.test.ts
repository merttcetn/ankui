import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_SETTINGS_STATE,
  settingsReducer,
  type SettingsState
} from "../../../src/tui/state/settings-state.js";

test("INITIAL_SETTINGS_STATE has cursor 0 and add-mode off", () => {
  assert.equal(INITIAL_SETTINGS_STATE.cursor, 0);
  assert.equal(INITIAL_SETTINGS_STATE.addMode, false);
  assert.equal(INITIAL_SETTINGS_STATE.addBuffer, "");
});

test("moveCursor up/down stays within [0, rootCount-1]", () => {
  let state: SettingsState = { ...INITIAL_SETTINGS_STATE, cursor: 1 };
  state = settingsReducer(state, { type: "moveCursor", direction: "down", rootCount: 3 });
  assert.equal(state.cursor, 2);
  state = settingsReducer(state, { type: "moveCursor", direction: "down", rootCount: 3 });
  // Already at max; clamp.
  assert.equal(state.cursor, 2);
  state = settingsReducer(state, { type: "moveCursor", direction: "up", rootCount: 3 });
  assert.equal(state.cursor, 1);
  state = settingsReducer(state, { type: "moveCursor", direction: "up", rootCount: 3 });
  state = settingsReducer(state, { type: "moveCursor", direction: "up", rootCount: 3 });
  // Already at 0; clamp.
  assert.equal(state.cursor, 0);
});

test("moveCursor with rootCount=0 leaves cursor at 0", () => {
  const state = settingsReducer(INITIAL_SETTINGS_STATE, {
    type: "moveCursor",
    direction: "down",
    rootCount: 0
  });
  assert.equal(state.cursor, 0);
});

test("enterAddMode flips addMode true and clears buffer", () => {
  const seed: SettingsState = { cursor: 1, addMode: false, addBuffer: "old" };
  const next = settingsReducer(seed, { type: "enterAddMode" });
  assert.equal(next.addMode, true);
  assert.equal(next.addBuffer, "");
  assert.equal(next.cursor, 1); // unchanged
});

test("setAddBuffer updates the buffer when in addMode", () => {
  const seed: SettingsState = { cursor: 0, addMode: true, addBuffer: "" };
  const next = settingsReducer(seed, { type: "setAddBuffer", value: "/Users/x" });
  assert.equal(next.addBuffer, "/Users/x");
});

test("cancelAddMode flips addMode off and clears buffer", () => {
  const seed: SettingsState = { cursor: 0, addMode: true, addBuffer: "abc" };
  const next = settingsReducer(seed, { type: "cancelAddMode" });
  assert.equal(next.addMode, false);
  assert.equal(next.addBuffer, "");
});

test("removeAtCursor clamps cursor to new max after removal", () => {
  // Before: cursor=2, rootCount=3 (last item) → after removal rootCount=2,
  // cursor must clamp to 1.
  const seed: SettingsState = { cursor: 2, addMode: false, addBuffer: "" };
  const next = settingsReducer(seed, { type: "removeAtCursor", newRootCount: 2 });
  assert.equal(next.cursor, 1);
});
