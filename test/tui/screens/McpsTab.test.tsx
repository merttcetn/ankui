import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import { McpsTab } from "../../../src/tui/screens/McpsTab.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createSkillId,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill,
  type ToolId
} from "../../../src/types.js";

function makeMcpSkill(
  toolId: ToolId,
  name: string,
  options: {
    sourcePath?: string;
    envKeys?: string[];
    capabilityCategories?: Skill["capabilityCategories"];
    accessLevel?: Skill["accessLevel"];
  } = {}
): Skill {
  const sourcePath = options.sourcePath ?? `/home/${toolId}-${name}`;
  return {
    id: createSkillId({ toolId, kind: "mcp_server", name, sourcePath }),
    toolId,
    kind: "mcp_server",
    name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "config",
    capabilityCategories: options.capabilityCategories ?? ["database"],
    accessLevel: options.accessLevel ?? "broad",
    details: options.envKeys ? { envKeys: options.envKeys } : undefined
  };
}

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

function fixture(input: { userSkills: { toolId: ToolId; skill: Skill }[] }): MultiProjectScanResult {
  const userScope = emptyScanResult();
  for (const { toolId, skill } of input.userSkills) {
    userScope.tools = userScope.tools.map((t) =>
      t.id === toolId
        ? { ...t, detected: true, detectedPaths: [`/home/.${toolId}`], skills: [...t.skills, skill] }
        : t
    );
  }
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

test("McpsTab renders a 'MCPS' section header", () => {
  const inst = render(<McpsTab result={fixture({ userSkills: [] })} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /M C P S/);
  inst.unmount();
});

test("McpsTab renders MCP names and capability tags", () => {
  const inst = render(
    <McpsTab
      result={fixture({
        userSkills: [
          {
            toolId: "claude",
            skill: makeMcpSkill("claude", "Postgres", {
              capabilityCategories: ["database"],
              accessLevel: "broad"
            })
          }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Postgres/);
  assert.match(frame, /database/);
  assert.match(frame, /broad/);
  inst.unmount();
});

test("McpsTab annotates groups configured in 2+ tools", () => {
  const inst = render(
    <McpsTab
      result={fixture({
        userSkills: [
          { toolId: "claude", skill: makeMcpSkill("claude", "shadcn") },
          { toolId: "codex",  skill: makeMcpSkill("codex",  "shadcn") }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /Configured in 2 tools/);
  inst.unmount();
});

test("McpsTab surfaces secret-bearing env keys", () => {
  const inst = render(
    <McpsTab
      result={fixture({
        userSkills: [
          {
            toolId: "claude",
            skill: makeMcpSkill("claude", "GitHub", { envKeys: ["GITHUB_TOKEN", "SAFE_VAR"] })
          }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /GITHUB_TOKEN/);
  // SAFE_VAR is not secret-like, should not appear in warning.
  assert.doesNotMatch(frame, /Secret.*SAFE_VAR/);
  inst.unmount();
});

test("McpsTab shows the empty-state message when no MCPs are configured", () => {
  const inst = render(<McpsTab result={fixture({ userSkills: [] })} />);
  const frame = inst.lastFrame() ?? "";
  assert.match(frame, /no MCP servers configured|No MCP servers/i);
  inst.unmount();
});

test("McpsTab renders one row per configuration with tool id and path", () => {
  const inst = render(
    <McpsTab
      result={fixture({
        userSkills: [
          {
            toolId: "claude",
            skill: makeMcpSkill("claude", "Postgres", { sourcePath: "/home/.claude/.mcp.json" })
          }
        ]
      })}
    />
  );
  const frame = inst.lastFrame() ?? "";
  // Tool id and home-relative path on the configuration row.
  assert.match(frame, /claude/);
  assert.match(frame, /~\/\.claude\/\.mcp\.json/);
  inst.unmount();
});
