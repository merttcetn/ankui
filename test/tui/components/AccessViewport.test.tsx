import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { AccessViewport } from "../../../src/tui/components/AccessViewport.js";
import {
  aggregateFindings
} from "../../../src/tui/util/finding-grouping.js";
import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  type Finding,
  type MultiProjectScanResult,
  type ScanResult
} from "../../../src/types.js";

function f(category: Finding["category"], title: string, sourcePaths: string[] = ["/home/.claude/.mcp.json"]): Finding {
  return createFinding({
    toolIds: ["claude"],
    title,
    message: "",
    category,
    accessLevel: "moderate",
    scope: "user",
    sourcePaths,
    relatedSkillIds: [],
    recommendation: `Review ${title}.`
  });
}

function resultWith(findings: Finding[]): MultiProjectScanResult {
  const tools = createAllEmptyTools();
  const userScope: ScanResult = {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings,
    warnings: [],
    summary: createScanSummary(tools)
  };
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

function sectionsFor(findings: Finding[]) {
  return aggregateFindings(resultWith(findings));
}

test("AccessViewport caps how many finding cards render at once", () => {
  const findings = Array.from({ length: 12 }, (_, i) =>
    f("dangerous_pattern", `finding-${String(i).padStart(2, "0")}`)
  );
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={0}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /finding-00/);
  assert.match(frame, /finding-02/);
  assert.doesNotMatch(frame, /finding-03/);
  assert.match(frame, /1\/12 findings/);
  inst.unmount();
});

test("AccessViewport scrolls the window so the active card stays visible", () => {
  const findings = Array.from({ length: 12 }, (_, i) =>
    f("dangerous_pattern", `finding-${String(i).padStart(2, "0")}`)
  );
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={10}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";

  assert.doesNotMatch(frame, /finding-00/);
  assert.match(frame, /finding-10/);
  assert.match(frame, /finding-11/);
  assert.match(frame, /11\/12 findings/);
  inst.unmount();
});

test("AccessViewport marks the active card with the ▶ prefix and leaves inactive ones unmarked", () => {
  const findings = [
    f("dangerous_pattern", "alpha"),
    f("dangerous_pattern", "bravo"),
    f("dangerous_pattern", "charlie")
  ];
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={1}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /▶\s+• bravo/);
  assert.doesNotMatch(frame, /▶\s+• alpha/);
  assert.doesNotMatch(frame, /▶\s+• charlie/);
  inst.unmount();
});

test("AccessViewport collapses source paths onto a single comma-separated line", () => {
  const findings = [
    f("duplicate_mcp", "shadcn", [
      "/home/.claude/.mcp.json",
      "/home/.codex/.mcp.json"
    ])
  ];
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={0}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(
    frame,
    /Sources:\s+~\/\.claude\/\.mcp\.json,\s+~\/\.codex\/\.mcp\.json/
  );
  inst.unmount();
});

test("AccessViewport renders the section header for the first visible finding of each section", () => {
  const findings = [
    f("duplicate_mcp", "dup-1"),
    f("secret_reference", "GITHUB_TOKEN")
  ];
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={0}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";

  assert.match(frame, /D U P L I C A T E/);
  assert.match(frame, /S E C R E T/);
  const dupIdx = frame.indexOf("D U P L I C A T E");
  const secretIdx = frame.indexOf("S E C R E T");
  assert.ok(dupIdx > -1 && secretIdx > dupIdx, "duplicate section appears before secret");
  inst.unmount();
});

test("AccessViewport footer follows the SkillViewport pattern", () => {
  const findings = [f("dangerous_pattern", "only")];
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={0}
      visibleCount={3}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /1\/1 findings · ↑\/↓ next\/prev/);
  inst.unmount();
});

test("AccessViewport defaults to one finding card (single-card pagination)", () => {
  // Two findings in the same section. With the default visibleCount, only
  // one should render — and the indicator should show 1/2.
  const findings = [
    f("unknown_capability", "Alpha MCP is not in catalog"),
    f("unknown_capability", "Beta MCP is not in catalog")
  ];
  const inst = render(
    <AccessViewport
      sections={sectionsFor(findings)}
      homeDir="/home"
      cursor={0}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Alpha MCP/, `expected first finding rendered: ${frame}`);
  assert.ok(
    !/Beta MCP/.test(frame),
    `expected second finding NOT rendered with default visibleCount=1: ${frame}`
  );
  assert.match(frame, /1\/2 findings/, `expected position indicator: ${frame}`);
  inst.unmount();
});
