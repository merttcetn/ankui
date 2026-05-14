import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { SearchBox } from "../../../src/tui/components/SearchBox.js";

test("SearchBox renders a leading slash prefix", () => {
  const inst = render(<SearchBox query="" />);
  assert.match(inst.lastFrame() ?? "", /\//);
  inst.unmount();
});

test("SearchBox renders the current query alongside the slash", () => {
  const inst = render(<SearchBox query="deploy" />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /\/deploy/);
  inst.unmount();
});

test("SearchBox renders a placeholder hint when query is empty", () => {
  const inst = render(<SearchBox query="" />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /search|filter|type to/i);
  inst.unmount();
});
