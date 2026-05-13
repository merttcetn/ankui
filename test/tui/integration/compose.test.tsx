import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";

import { Frame } from "../../../src/tui/components/Frame.js";
import { TabBar } from "../../../src/tui/components/TabBar.js";
import { SectionHeader } from "../../../src/tui/components/SectionHeader.js";
import { DotLeaderRow } from "../../../src/tui/components/DotLeaderRow.js";

test("Frame composes with TabBar, SectionHeader, and DotLeaderRow without layout collisions", () => {
  const tabs = [
    [
      { id: "overview", label: "Overview" },
      { id: "claude", label: "Claude" },
      { id: "codex", label: "Codex" }
    ],
    [
      { id: "mcps", label: "MCPs" },
      { id: "access", label: "Access" }
    ]
  ];

  const { lastFrame } = render(
    <Frame>
      <Box flexDirection="column">
        <Text>ankui</Text>
        <TabBar rows={tabs} activeId="overview" />
        <SectionHeader label="overview" underlineWidth={40} />
        <DotLeaderRow label="Claude" metadata="82 user · 6 project" width={60} />
        <DotLeaderRow label="Codex" metadata="92 user · 0 project" width={60} active />
      </Box>
    </Frame>
  );

  const frame = lastFrame() ?? "";

  // 1. Frame produced corners.
  assert.ok(frame.includes("┏"));
  assert.ok(frame.includes("┛"));

  // 2. TabBar active label was uppercased and underlined.
  assert.ok(frame.includes("OVERVIEW"));
  assert.ok(frame.includes("━".repeat(8))); // "OVERVIEW".length

  // 3. SectionHeader spaced uppercase.
  assert.ok(frame.includes("O V E R V I E W"));
  // 4. SectionHeader 40-wide underline visible inside the frame.
  assert.ok(frame.includes("─".repeat(40)));

  // 5. Both DotLeaderRows present with dot leaders.
  assert.ok(frame.includes("Claude"));
  assert.ok(frame.includes("Codex"));
  assert.ok(frame.includes(" · "));

  // 6. Active row prefix ▶ for the Codex row.
  assert.ok(frame.includes("▶"));

  // 7. Sanity: no row is absurdly long (catches accidental width="100%" +
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
