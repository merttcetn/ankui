import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSessionSummary,
  formatSessionSummary,
  type SessionAction
} from "../../src/utils/session-summary.js";

test("computeSessionSummary returns empty lists for no actions", () => {
  const s = computeSessionSummary([]);
  assert.deepEqual(s.netDisabled, []);
  assert.deepEqual(s.netEnabled, []);
});

test("computeSessionSummary reports a single disable", () => {
  const actions: SessionAction[] = [{ toolId: "claude", name: "make-pdf", action: "disable" }];
  const s = computeSessionSummary(actions);
  assert.deepEqual(s.netDisabled, [{ toolId: "claude", name: "make-pdf" }]);
  assert.deepEqual(s.netEnabled, []);
});

test("computeSessionSummary reports a single enable", () => {
  const actions: SessionAction[] = [{ toolId: "claude", name: "make-pdf", action: "enable" }];
  const s = computeSessionSummary(actions);
  assert.deepEqual(s.netDisabled, []);
  assert.deepEqual(s.netEnabled, [{ toolId: "claude", name: "make-pdf" }]);
});

test("computeSessionSummary collapses a disable-then-enable round-trip to net zero", () => {
  const actions: SessionAction[] = [
    { toolId: "claude", name: "make-pdf", action: "disable" },
    { toolId: "claude", name: "make-pdf", action: "enable" }
  ];
  const s = computeSessionSummary(actions);
  assert.deepEqual(s.netDisabled, []);
  assert.deepEqual(s.netEnabled, []);
});

test("computeSessionSummary keeps independent skills with their own net counts", () => {
  const actions: SessionAction[] = [
    { toolId: "claude", name: "alpha", action: "disable" },
    { toolId: "claude", name: "bravo", action: "enable" },
    { toolId: "codex", name: "alpha", action: "disable" }
  ];
  const s = computeSessionSummary(actions);
  const sortedDisabled = [...s.netDisabled].sort((a, b) => a.toolId.localeCompare(b.toolId));
  assert.deepEqual(sortedDisabled, [
    { toolId: "claude", name: "alpha" },
    { toolId: "codex", name: "alpha" }
  ]);
  assert.deepEqual(s.netEnabled, [{ toolId: "claude", name: "bravo" }]);
});

test("computeSessionSummary same-skill disable+enable+disable nets to disabled", () => {
  const actions: SessionAction[] = [
    { toolId: "claude", name: "alpha", action: "disable" },
    { toolId: "claude", name: "alpha", action: "enable" },
    { toolId: "claude", name: "alpha", action: "disable" }
  ];
  const s = computeSessionSummary(actions);
  assert.deepEqual(s.netDisabled, [{ toolId: "claude", name: "alpha" }]);
  assert.deepEqual(s.netEnabled, []);
});

test("formatSessionSummary returns empty string when nothing net-changed", () => {
  assert.equal(formatSessionSummary({ netDisabled: [], netEnabled: [] }), "");
});

test("formatSessionSummary renders disabled-only summary", () => {
  const text = formatSessionSummary({
    netDisabled: [{ toolId: "claude", name: "make-pdf" }],
    netEnabled: []
  });
  assert.match(text, /Disabled \(1\):/);
  assert.match(text, /○ claude\/make-pdf/);
  assert.doesNotMatch(text, /Enabled/);
});

test("formatSessionSummary renders enabled-only summary", () => {
  const text = formatSessionSummary({
    netDisabled: [],
    netEnabled: [{ toolId: "codex", name: "alpha" }]
  });
  assert.match(text, /Enabled \(1\):/);
  assert.match(text, /● codex\/alpha/);
  assert.doesNotMatch(text, /Disabled/);
});

test("formatSessionSummary renders both sections separated by a blank line", () => {
  const text = formatSessionSummary({
    netDisabled: [{ toolId: "claude", name: "a" }],
    netEnabled: [{ toolId: "gemini", name: "b" }]
  });
  const lines = text.split("\n");
  const dIdx = lines.findIndex((l) => l.includes("Disabled"));
  const eIdx = lines.findIndex((l) => l.includes("Enabled"));
  assert.ok(dIdx >= 0 && eIdx > dIdx, "Disabled section appears before Enabled");
  assert.equal(lines[eIdx - 1], "", "blank line separates the two sections");
});
