import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";

import { Frame } from "../../../src/tui/components/Frame.js";
import { Sidebar } from "../../../src/tui/components/Sidebar.js";
import { SectionHeader } from "../../../src/tui/components/SectionHeader.js";
import { DotLeaderRow } from "../../../src/tui/components/DotLeaderRow.js";

test("Frame composes with Sidebar, SectionHeader, and DotLeaderRow without layout collisions", () => {
  const tools = [
    { id: "overview", label: "Overview" },
    { id: "claude", label: "Claude" },
    { id: "codex", label: "Codex" }
  ];
  const views = [
    { id: "mcps", label: "MCPs" },
    { id: "access", label: "Access" }
  ];

  const { lastFrame } = render(
    <Frame>
      <Box flexDirection="row">
        <Sidebar
          sections={[
            { label: "TOOLS", items: tools },
            { label: "VIEWS", items: views }
          ]}
          activeId="overview"
          focus="sidebar"
        />
        <Box flexDirection="column" paddingLeft={2}>
          <Text>ankui</Text>
          <SectionHeader label="overview" underlineWidth={40} />
          <DotLeaderRow label="Claude" metadata="82 user · 6 project" width={60} />
          <DotLeaderRow label="Codex" metadata="92 user · 0 project" width={60} active />
        </Box>
      </Box>
    </Frame>
  );

  const frame = lastFrame() ?? "";

  // 1. Frame produced corners.
  assert.ok(frame.includes("┏"));
  assert.ok(frame.includes("┛"));

  // 2. Sidebar rendered both section headers with their light `─` underlines.
  assert.ok(frame.includes("TOOLS"));
  assert.ok(frame.includes("VIEWS"));
  assert.ok(frame.includes("─".repeat(5))); // "TOOLS".length

  // 3. Active sidebar row got the ▶ UPPERCASE treatment.
  assert.ok(frame.includes("▶ OVERVIEW"));

  // 4. SectionHeader spaced uppercase in the right pane.
  assert.ok(frame.includes("O V E R V I E W"));
  // 5. SectionHeader 40-wide underline visible inside the frame.
  assert.ok(frame.includes("─".repeat(40)));

  // 6. Both DotLeaderRows present with dot leaders.
  assert.ok(frame.includes("Claude"));
  assert.ok(frame.includes("Codex"));
  assert.ok(frame.includes(" · "));

  // 7. The Codex row is active and emits its own ▶ prefix (in addition to the
  // sidebar's `▶ OVERVIEW` row).
  const arrowCount = (frame.match(/▶/g) ?? []).length;
  assert.ok(arrowCount >= 2, `expected ≥2 ▶ glyphs (sidebar + dot-leader), got ${arrowCount}`);

  // 8. Sanity: no row is absurdly long (catches accidental width="100%" +
  //    Math.repeat blow-ups in narrow test terminals).
  const longestLine = frame.split("\n").reduce(
    (acc, line) => (line.length > acc ? line.length : acc),
    0
  );
  assert.ok(
    longestLine < 200,
    `longest line was ${longestLine} chars; primitives may be over-stretching`
  );
});
