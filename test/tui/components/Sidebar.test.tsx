import React from "react";
import { render } from "ink-testing-library";
import assert from "node:assert/strict";
import test from "node:test";

import { Sidebar } from "../../../src/tui/components/Sidebar.js";

const TOOLS = [
  { id: "overview", label: "Overview" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" }
];

const VIEWS = [
  { id: "mcps", label: "MCPs" },
  { id: "settings", label: "Settings" }
];

test("Sidebar renders TOOLS and VIEWS section headers", () => {
  const { lastFrame } = render(
    <Sidebar
      sections={[
        { label: "TOOLS", items: TOOLS },
        { label: "VIEWS", items: VIEWS }
      ]}
      activeId="overview"
      focus="sidebar"
    />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("TOOLS"), `expected TOOLS section header in:\n${frame}`);
  assert.ok(frame.includes("VIEWS"), `expected VIEWS section header in:\n${frame}`);
});

test("Sidebar with focus='sidebar' uppercases the active label and shows ▶", () => {
  const { lastFrame } = render(
    <Sidebar
      sections={[
        { label: "TOOLS", items: TOOLS },
        { label: "VIEWS", items: VIEWS }
      ]}
      activeId="claude"
      focus="sidebar"
    />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("CLAUDE CODE"), `expected uppercase active label: ${frame}`);
  assert.ok(frame.includes("▶"), `expected ▶ active prefix: ${frame}`);
});

test("Sidebar with focus='panel' renders the active label without uppercase or ▶", () => {
  const { lastFrame } = render(
    <Sidebar
      sections={[
        { label: "TOOLS", items: TOOLS },
        { label: "VIEWS", items: VIEWS }
      ]}
      activeId="claude"
      focus="panel"
    />
  );
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("Claude Code"), `expected mixed-case active label: ${frame}`);
  assert.ok(!frame.includes("▶"), `expected no ▶ prefix when focus is on panel: ${frame}`);
});

test("Sidebar renders inactive labels in their original casing", () => {
  const { lastFrame } = render(
    <Sidebar
      sections={[{ label: "TOOLS", items: TOOLS }]}
      activeId="overview"
      focus="sidebar"
    />
  );
  const frame = lastFrame() ?? "";
  // "Codex" is inactive in this fixture; should appear in its original case.
  assert.ok(frame.includes("Codex"), `expected inactive label preserved: ${frame}`);
});
