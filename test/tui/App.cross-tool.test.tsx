import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { App } from "../../src/tui/App.js";
import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  createSkillId,
  createWarning,
  type Finding,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill,
  type ToolId
} from "../../src/types.js";

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

function withDetectedTool(scan: ScanResult, id: ToolId, paths: string[]): ScanResult {
  return {
    ...scan,
    tools: scan.tools.map((t) =>
      t.id === id ? { ...t, detected: true, detectedPaths: paths } : t
    )
  };
}

function withMcpSkill(scan: ScanResult, id: ToolId, name: string): ScanResult {
  const skill: Skill = {
    id: createSkillId({ toolId: id, kind: "mcp_server", name, sourcePath: `/home/.${id}` }),
    toolId: id,
    kind: "mcp_server",
    name,
    summary: "",
    scope: "user",
    sourcePath: `/home/.${id}`,
    source: "config",
    capabilityCategories: ["database"],
    accessLevel: "broad"
  };
  return {
    ...scan,
    tools: scan.tools.map((t) =>
      t.id === id ? { ...t, skills: [...t.skills, skill] } : t
    )
  };
}

function fixture(): MultiProjectScanResult {
  let userScope = emptyScanResult();
  userScope = withDetectedTool(userScope, "claude", ["/home/.claude"]);
  userScope = withMcpSkill(userScope, "claude", "Postgres");
  const finding: Finding = createFinding({
    toolIds: ["claude"],
    title: "duplicate-test",
    message: "",
    category: "duplicate_mcp",
    accessLevel: "moderate",
    scope: "cross_tool",
    sourcePaths: ["/home/.claude/.mcp.json"],
    relatedSkillIds: [],
    recommendation: "Review."
  });
  userScope.findings = [finding];
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects: [],
    warnings: [createWarning({ reason: "symlink_skipped", path: "/home/x", message: "" })],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 1 }
  };
}

test("App renders second tab row containing MCPs, Access, Doctor", () => {
  const inst = render(<App result={fixture()} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /MCPs/);
  assert.match(frame, /Access/);
  assert.match(frame, /Doctor/);
  inst.unmount();
});

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function pressTabs(stdin: { write: (s: string) => void }, count: number): Promise<void> {
  // Let Ink mount and enable raw-mode (via useEffect) before the first write,
  // otherwise the initial keypresses arrive before the input listener attaches.
  await flush();
  for (let i = 0; i < count; i += 1) {
    stdin.write("\t");
    await flush();
  }
}

test("App routes activeTab='mcps' to McpsTab screen", async () => {
  const inst = render(<App result={fixture()} />);
  // Cycle tabs past tools row until MCPS is active. Overview + 6 tools = 7
  // entries in the first row, so 7 Tabs land us on `mcps`.
  await pressTabs(inst.stdin, 7);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /M C P S/);
  assert.match(frame, /Postgres/);
  inst.unmount();
});

test("App routes activeTab='access' to AccessTab screen", async () => {
  const inst = render(<App result={fixture()} />);
  await pressTabs(inst.stdin, 8);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /A C C E S S/);
  assert.match(frame, /duplicate-test/);
  inst.unmount();
});

test("App routes activeTab='doctor' to DoctorTab screen", async () => {
  const inst = render(<App result={fixture()} />);
  await pressTabs(inst.stdin, 9);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /D O C T O R/);
  assert.match(frame, /symlink_skipped/);
  inst.unmount();
});
