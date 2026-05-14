import assert from "node:assert/strict";
import test from "node:test";
import React, { useState } from "react";
import { render } from "ink-testing-library";

import { TextInput } from "../../../src/tui/components/TextInput.js";

function Controlled(props: {
  initial?: string;
  onSubmit: (value: string) => void;
  placeholder?: string;
}): React.ReactElement {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <TextInput
      value={value}
      onChange={setValue}
      onSubmit={props.onSubmit}
      placeholder={props.placeholder}
    />
  );
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("TextInput renders the placeholder when value is empty", () => {
  const inst = render(<Controlled onSubmit={() => {}} placeholder="path…" />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /path…/);
  inst.unmount();
});

test("TextInput appends typed printable characters to the buffer", async () => {
  const inst = render(<Controlled onSubmit={() => {}} />);
  await flush();
  inst.stdin.write("ab");
  await flush();
  inst.stdin.write("c");
  await flush();
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /abc/);
  inst.unmount();
});

test("TextInput removes the last character on backspace", async () => {
  const inst = render(<Controlled initial="abc" onSubmit={() => {}} />);
  await flush();
  // Ink emits delete/backspace as key.backspace OR key.delete depending on
  // terminal; ink-testing-library's stdin.write("\x7f") triggers key.delete
  // on macOS — the implementation must accept both.
  inst.stdin.write("\x7f");
  await flush();
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /ab(?!c)/);
  inst.unmount();
});

test("TextInput calls onSubmit with the current value when Enter pressed", async () => {
  let submitted = "";
  const inst = render(
    <Controlled initial="/Users/x/code" onSubmit={(v) => { submitted = v; }} />
  );
  await flush();
  inst.stdin.write("\r");
  await flush();
  assert.equal(submitted, "/Users/x/code");
  inst.unmount();
});

test("TextInput ignores arrow keys", async () => {
  const inst = render(<Controlled initial="hi" onSubmit={() => {}} />);
  await flush();
  inst.stdin.write("\x1B[A"); // up arrow
  await flush();
  inst.stdin.write("\x1B[B"); // down arrow
  await flush();
  const frame = inst.lastFrame() ?? "";
  // Buffer unchanged.
  assert.match(frame, /hi/);
  inst.unmount();
});
