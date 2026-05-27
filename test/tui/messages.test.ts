import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_STATE_WHISPERS,
  IDLE_WHISPERS,
  REMEMBER_MESSAGES,
  SCAN_COMPLETE,
  pickRandomWhisper,
  shuffleRemainder
} from "../../src/tui/messages.js";

test("REMEMBER_MESSAGES first two slots are deterministic", () => {
  assert.equal(REMEMBER_MESSAGES[0], "Remembering...");
  assert.equal(REMEMBER_MESSAGES[1], "Anghkooey.");
});

test("REMEMBER_MESSAGES has 20 entries", () => {
  assert.equal(REMEMBER_MESSAGES.length, 20);
});

test("SCAN_COMPLETE is 'Remembered.'", () => {
  assert.equal(SCAN_COMPLETE, "Remembered.");
});

test("EMPTY_STATE_WHISPERS has the five keys from the spec", () => {
  assert.equal(EMPTY_STATE_WHISPERS.noFindings, "the talismans are holding.");
  assert.equal(
    EMPTY_STATE_WHISPERS.noMcps,
    "no servers configured. you haven't asked for help yet."
  );
  assert.equal(EMPTY_STATE_WHISPERS.noWarnings, "quiet tonight.");
  assert.equal(EMPTY_STATE_WHISPERS.noProjectSkills, "nothing left here to remember.");
  assert.equal(EMPTY_STATE_WHISPERS.noActions, "nothing staged. nothing to disturb.");
});

test("IDLE_WHISPERS has 7 entries", () => {
  assert.equal(IDLE_WHISPERS.length, 7);
});

test("shuffleRemainder returns a permutation of the tail", () => {
  const source = ["a", "b", "c", "d", "e"];
  const random = (() => {
    let i = 0;
    const seq = [0.1, 0.5, 0.9, 0.2]; // produces a fixed permutation
    return () => seq[i++ % seq.length];
  })();
  const result = shuffleRemainder(source, 2, random);
  assert.equal(result.length, 5);
  assert.equal(result[0], "a");
  assert.equal(result[1], "b");
  const tail = [...result.slice(2)].sort();
  assert.deepEqual(tail, ["c", "d", "e"]);
});

test("shuffleRemainder is non-destructive (does not mutate source)", () => {
  const source = ["x", "y", "z"];
  const snapshot = [...source];
  shuffleRemainder(source, 1, () => 0);
  assert.deepEqual(source, snapshot);
});

test("pickRandomWhisper returns a string from IDLE_WHISPERS", () => {
  const picked = pickRandomWhisper(() => 0);
  assert.equal(picked, IDLE_WHISPERS[0]);
});

test("pickRandomWhisper uses Math.random by default and stays in range", () => {
  for (let i = 0; i < 50; i++) {
    const picked = pickRandomWhisper();
    assert.ok(IDLE_WHISPERS.includes(picked));
  }
});
