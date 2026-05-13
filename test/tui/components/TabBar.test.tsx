import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { TabBar } from "../../../src/tui/components/TabBar.js";

const TOP_ROW = [
  { id: "overview", label: "Overview" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" }
];

const BOTTOM_ROW = [
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" }
];

test("TabBar renders both rows of tab labels", () => {
  const { lastFrame } = render(
    <TabBar rows={[TOP_ROW, BOTTOM_ROW]} activeId="overview" />
  );
  const frame = lastFrame() ?? "";
  // Top row labels (active is UPPERCASE, others as given)
  assert.ok(frame.includes("OVERVIEW"));
  assert.ok(frame.includes("Claude"));
  assert.ok(frame.includes("Codex"));
  // Bottom row labels
  assert.ok(frame.includes("MCPs"));
  assert.ok(frame.includes("Access"));
  assert.ok(frame.includes("Doctor"));
});

test("TabBar uppercases the active tab label and underlines it with ━", () => {
  const { lastFrame } = render(
    <TabBar rows={[TOP_ROW, BOTTOM_ROW]} activeId="claude" />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("CLAUDE"), "active label must be uppercased");
  // Underline length = "CLAUDE".length = 6
  assert.ok(frame.includes("━".repeat(6)), "expected ━━━━━━ underline beneath active tab");
});

test("TabBar without a matching activeId renders no underline", () => {
  const { lastFrame } = render(
    <TabBar rows={[TOP_ROW, BOTTOM_ROW]} activeId="nonexistent" />
  );
  const frame = lastFrame() ?? "";
  // No tab is active → underline row has zero ━ runs.
  assert.equal(frame.match(/━+/g)?.length ?? 0, 0);
});
