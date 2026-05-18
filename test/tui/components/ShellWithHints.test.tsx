import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

import { ShellWithHints } from "../../../src/tui/components/ShellWithHints.js";

test("ShellWithHints renders the hint row with the provided hints", () => {
  const inst = render(
    <ShellWithHints hints={["←→ tabs", "q quit"]}>
      <Text>body</Text>
    </ShellWithHints>
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /←→ tabs/);
  assert.match(frame, /q quit/);
  inst.unmount();
});

test("ShellWithHints renders the child content inside a heavy-border frame", () => {
  const inst = render(
    <ShellWithHints hints={["q quit"]}>
      <Text>hello-from-shell</Text>
    </ShellWithHints>
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /hello-from-shell/);
  // Heavy top-left corner glyph confirms the Frame's bold border style wrapped the child.
  assert.match(frame, /┏/);
  inst.unmount();
});
