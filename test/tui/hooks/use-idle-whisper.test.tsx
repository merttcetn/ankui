import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";

import { useIdleWhisper } from "../../../src/tui/hooks/use-idle-whisper.js";

function Probe(props: {
  enabled: boolean;
  idleMs: number;
  lingerMs: number;
  chance: number;
  random: () => number;
}): React.ReactElement {
  const { whisper } = useIdleWhisper({
    enabled: props.enabled,
    idleMs: props.idleMs,
    lingerMs: props.lingerMs,
    chance: props.chance,
    random: props.random
  });
  return <Text>{whisper ?? "[none]"}</Text>;
}

test("useIdleWhisper returns null before idle threshold", () => {
  const inst = render(
    <Probe
      enabled={true}
      idleMs={1_000_000}
      lingerMs={5_000}
      chance={1.0}
      random={() => 0}
    />
  );
  assert.match(inst.lastFrame() ?? "", /\[none\]/);
  inst.unmount();
});

test("useIdleWhisper returns a whisper after idleMs elapses (chance=1.0)", async () => {
  const inst = render(
    <Probe
      enabled={true}
      idleMs={10}
      lingerMs={1_000_000}
      chance={1.0}
      random={() => 0}
    />
  );
  await new Promise((r) => setTimeout(r, 80));
  const frame = inst.lastFrame() ?? "";
  assert.doesNotMatch(frame, /\[none\]/);
  assert.match(frame, /every scan is another lap\./);
  inst.unmount();
});

test("useIdleWhisper stays null when chance is 0", async () => {
  const inst = render(
    <Probe
      enabled={true}
      idleMs={10}
      lingerMs={1_000_000}
      chance={0.0}
      random={() => 0.99}
    />
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.match(inst.lastFrame() ?? "", /\[none\]/);
  inst.unmount();
});

test("useIdleWhisper clears whisper after lingerMs", async () => {
  // First roll fires (returns 0 → < chance), subsequent rolls miss
  // (returns 0.99 → >= chance), so the whisper clears and stays cleared.
  let calls = 0;
  const random = () => {
    calls += 1;
    return calls <= 2 ? 0 : 0.99;
  };
  const inst = render(
    <Probe
      enabled={true}
      idleMs={10}
      lingerMs={30}
      chance={0.5}
      random={random}
    />
  );
  await new Promise((r) => setTimeout(r, 25));
  assert.doesNotMatch(inst.lastFrame() ?? "", /\[none\]/);
  await new Promise((r) => setTimeout(r, 80));
  assert.match(inst.lastFrame() ?? "", /\[none\]/);
  inst.unmount();
});

test("useIdleWhisper stays null when disabled", async () => {
  const inst = render(
    <Probe
      enabled={false}
      idleMs={10}
      lingerMs={1_000_000}
      chance={1.0}
      random={() => 0}
    />
  );
  await new Promise((r) => setTimeout(r, 30));
  assert.match(inst.lastFrame() ?? "", /\[none\]/);
  inst.unmount();
});
