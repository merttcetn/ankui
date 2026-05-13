import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { StatusPill } from "../../../src/tui/components/StatusPill.js";

test("StatusPill renders ●, label, separator, and access level", () => {
  const { lastFrame } = render(
    <StatusPill label="database" accessLevel="broad" />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("●"));
  assert.ok(frame.includes("database"));
  assert.ok(frame.includes("·"));
  assert.ok(frame.includes("broad"));
});

test("StatusPill renders each access level", () => {
  for (const level of ["broad", "moderate", "limited", "unknown"] as const) {
    const { lastFrame } = render(
      <StatusPill label="cat" accessLevel={level} />
    );
    const frame = lastFrame() ?? "";
    assert.ok(frame.includes(level), `expected to render the word "${level}"`);
    assert.ok(frame.includes("●"));
  }
});
