import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { Breadcrumb } from "../../../src/tui/components/Breadcrumb.js";

test("Breadcrumb renders parts separated by the editorial slash", () => {
  const { lastFrame } = render(
    <Breadcrumb parts={["ankui", "Claude", "ankui"]} />
  );
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("ankui"));
  assert.ok(frame.includes("Claude"));
  // Editorial slash ╱ (U+2571), not ASCII /
  assert.ok(frame.includes("╱"));
  assert.equal(frame.includes("/"), false, "must not use ASCII slash");
});

test("Breadcrumb with a single part renders no separator", () => {
  const { lastFrame } = render(<Breadcrumb parts={["ankui"]} />);
  const frame = lastFrame() ?? "";

  assert.ok(frame.includes("ankui"));
  assert.equal(frame.match(/╱/g)?.length ?? 0, 0);
});

test("Breadcrumb separator count = parts.length - 1", () => {
  const { lastFrame } = render(
    <Breadcrumb parts={["ankui", "Claude", "ankui", "skills"]} />
  );
  const frame = lastFrame() ?? "";
  assert.equal(frame.match(/╱/g)?.length, 3);
});
