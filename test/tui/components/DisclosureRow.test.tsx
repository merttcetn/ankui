import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

import { DisclosureRow } from "../../../src/tui/components/DisclosureRow.js";

test("DisclosureRow shows ◆ when open and reveals children", () => {
  const { lastFrame } = render(
    <DisclosureRow label="user scope" open>
      <Text>nested content</Text>
    </DisclosureRow>
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("◆"), "expected ◆ open marker");
  assert.ok(frame.includes("user scope"));
  assert.ok(frame.includes("nested content"));
});

test("DisclosureRow shows ◇ when closed and hides children", () => {
  const { lastFrame } = render(
    <DisclosureRow label="user scope" open={false}>
      <Text>nested content</Text>
    </DisclosureRow>
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("◇"), "expected ◇ closed marker");
  assert.ok(frame.includes("user scope"));
  assert.equal(
    frame.includes("nested content"),
    false,
    "closed disclosure must not render children"
  );
});

test("DisclosureRow with no children renders just the row", () => {
  const { lastFrame } = render(<DisclosureRow label="rules" open={false} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("◇"));
  assert.ok(frame.includes("rules"));
});

test("DisclosureRow accepts a right-aligned summary (e.g., count badge)", () => {
  const { lastFrame } = render(
    <DisclosureRow label="agent skills" open={false} rightSummary="[82]" />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("[82]"));
});
