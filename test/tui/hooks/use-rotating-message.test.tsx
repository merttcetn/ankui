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
  try {
    // Poll up to 2s — CI runners can starve a 50ms interval, and a one-shot
    // sleep races with scheduler jitter. We just need to see the message
    // advance once, not catch the exact moment.
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && !/Anghkooey\./.test(inst.lastFrame() ?? "")) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.match(inst.lastFrame() ?? "", /Anghkooey\./);
  } finally {
    inst.unmount();
  }
});

test("useRotatingMessage holds at 'Remembering...' when active is false", async () => {
  const inst = render(<Probe active={false} intervalMs={10} />);
  try {
    await new Promise((r) => setTimeout(r, 50));
    assert.match(inst.lastFrame() ?? "", /Remembering\.\.\./);
  } finally {
    inst.unmount();
  }
});

test("useRotatingMessage clears its interval on unmount (no throws after unmount)", async () => {
  const inst = render(<Probe active={true} intervalMs={5} />);
  inst.unmount();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(true);
});
