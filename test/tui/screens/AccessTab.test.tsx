import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { AccessTab } from "../../../src/tui/screens/AccessTab.js";
import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  type Finding,
  type MultiProjectScanResult,
  type ScanResult
} from "../../../src/types.js";

function emptyScanResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function f(
  category: Finding["category"],
  title: string,
  options: {
    scope?: Finding["scope"];
    toolIds?: Finding["toolIds"];
    sourcePaths?: string[];
    recommendation?: string;
  } = {}
): Finding {
  return createFinding({
    toolIds: options.toolIds ?? ["claude"],
    title,
    message: "",
    category,
    accessLevel: "moderate",
    scope: options.scope ?? "user",
    sourcePaths: options.sourcePaths ?? ["/home/.claude/.mcp.json"],
    relatedSkillIds: [],
    recommendation: options.recommendation ?? "Review."
  });
}

function resultWith(findings: Finding[]): MultiProjectScanResult {
  const userScope = emptyScanResult();
  userScope.findings = findings;
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("AccessTab renders the 'ACCESS' section header and total count", () => {
  const inst = render(
    <AccessTab
      result={resultWith([f("duplicate_mcp", "shadcn"), f("secret_reference", "GITHUB_TOKEN")])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /A C C E S S/);
  assert.match(frame, /2 findings/);
  inst.unmount();
});

test("AccessTab emits sections in priority order", () => {
  // visibleCount=10 widens the viewport so all 4 sections render in one
  // frame — production default is 3 (card-paginated). The ordering itself
  // is also covered by finding-grouping.test.ts, but we still want the
  // screen to round-trip that order without reshuffling.
  const inst = render(
    <AccessTab
      visibleCount={10}
      result={resultWith([
        f("dangerous_pattern", "rm -rf"),
        f("broad_access_capability", "BroadMCP"),
        f("secret_reference", "GITHUB_TOKEN"),
        f("duplicate_mcp", "shadcn")
      ])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  const broadIdx   = frame.indexOf("B R O A D");
  const dupIdx     = frame.indexOf("D U P L I C A T E");
  const secretIdx  = frame.indexOf("S E C R E T");
  const dangerIdx  = frame.indexOf("R E V I E W");
  assert.ok(broadIdx > 0 && broadIdx < dangerIdx, "broad before dangerous");
  assert.ok(dangerIdx < secretIdx, "dangerous before secret");
  assert.ok(secretIdx < dupIdx, "secret before duplicate");
  inst.unmount();
});

test("AccessTab renders finding title, scope, tools, sources, recommendation", () => {
  const inst = render(
    <AccessTab
      result={resultWith([
        f("duplicate_mcp", "shadcn configured in 2 tools", {
          scope: "cross_tool",
          toolIds: ["claude", "codex"],
          sourcePaths: ["/home/.claude/.mcp.json", "/home/.codex/.mcp.json"],
          recommendation: "Decide which tool owns the MCP."
        })
      ])}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /shadcn configured in 2 tools/);
  assert.match(frame, /cross_tool/);
  assert.match(frame, /claude, codex/);
  assert.match(frame, /~\/\.claude\/\.mcp\.json/);
  assert.match(frame, /Decide which tool owns the MCP\./);
  inst.unmount();
});

test("AccessTab shows the empty-state message when no findings exist", () => {
  const inst = render(<AccessTab result={resultWith([])} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /no findings|No findings/i);
  inst.unmount();
});

test("AccessTab renders the noFindings whisper when findings array is empty", () => {
  const inst = render(<AccessTab result={resultWith([])} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /the talismans are holding\./);
  inst.unmount();
});
