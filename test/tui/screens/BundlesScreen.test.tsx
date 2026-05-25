import test from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import React from "react";

import { BundlesScreen } from "../../../src/tui/screens/BundlesScreen.js";
import type { BundleRegistry } from "../../../src/bundles/registry.js";

const reg: BundleRegistry = {
  version: 1,
  bundles: [
    {
      name: "foo/skills",
      url: "https://github.com/foo/skills",
      pinnedSha: "a".repeat(40),
      pinnedCommitMessage: "Initial",
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user",
      installs: [{ toolId: "claude", skillName: "autoplan", bundlePath: "x", symlinkPath: "y" }]
    }
  ]
};

test("BundlesScreen lists each registry entry with name + short SHA + scope", () => {
  const inst = render(<BundlesScreen registry={reg} cursor={0} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /foo\/skills/);
  assert.match(frame, /aaaaaaa/);
  assert.match(frame, /user/);
  inst.unmount();
});

test("BundlesScreen shows the empty-state whisper when registry is empty", () => {
  const inst = render(<BundlesScreen registry={{ version: 1, bundles: [] }} cursor={0} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /no bundles installed/i);
  inst.unmount();
});

test("BundlesScreen shows '1 bundle installed' (singular) for one entry", () => {
  const inst = render(<BundlesScreen registry={reg} cursor={0} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /1 bundle installed/);
  inst.unmount();
});
