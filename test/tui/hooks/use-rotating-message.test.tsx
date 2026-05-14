import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";

import { useRotatingMessage } from "../../../src/tui/hooks/use-rotating-message.js";

function Probe({
  active,
  intervalMs
}: {
  active: boolean;
  intervalMs?: number;
}): React.ReactElement {
  const { message } = useRotatingMessage({ active, intervalMs });
  return <Text>{message}</Text>;
}

test("useRotatingMessage returns 'Remembering...' on first render", () => {
  const inst = render(<Probe active={true} intervalMs={1_000_000} />);
  assert.match(inst.lastFrame() ?? "", /Remembering\.\.\./);
  inst.unmount();
});

test("useRotatingMessage advances to 'Anghkooey.' after one interval", async () => {
  const inst = render(<Probe active={true} intervalMs={50} />);
  await new Promise((r) => setTimeout(r, 75));
  assert.match(inst.lastFrame() ?? "", /Anghkooey\./);
  inst.unmount();
});

test("useRotatingMessage holds at 'Remembering...' when active is false", async () => {
  const inst = render(<Probe active={false} intervalMs={10} />);
  await new Promise((r) => setTimeout(r, 25));
  assert.match(inst.lastFrame() ?? "", /Remembering\.\.\./);
  inst.unmount();
});

test("useRotatingMessage clears its interval on unmount (no throws after unmount)", async () => {
  const inst = render(<Probe active={true} intervalMs={5} />);
  inst.unmount();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(true);
});
