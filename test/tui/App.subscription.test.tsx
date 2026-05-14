import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import type { AITool, MultiProjectScanResult, ToolId } from "../../src/types.js";
import { App } from "../../src/tui/App.js";

function makeTool(id: ToolId): AITool {
  return {
    id,
    name: id,
    description: "",
    detected: true,
    detectedPaths: [],
    skills: [],
    findings: [],
    warnings: [],
    stats: {
      mcpServers: 0,
      customCommands: 0,
      customAgents: 0,
      customPrompts: 0,
      customTools: 0,
      plugins: 0,
      rules: 0,
      memoryFiles: 0,
      agentSkills: 0,
      skillsShSkills: 0,
      findings: 0
    }
  };
}

function makeResult(toolIds: readonly ToolId[]): MultiProjectScanResult {
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/home/u",
    homeDir: "/home/u",
    devRoots: [],
    userScope: {
      scannedAt: "2026-05-14T00:00:00.000Z",
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: toolIds.map(makeTool),
      findings: [],
      warnings: [],
      summary: {
        detectedTools: toolIds.length,
        totalSkills: 0,
        totalMcpServers: 0,
        uniqueMcpServers: 0,
        customCommands: 0,
        customTools: 0,
        plugins: 0,
        memoryFiles: 0,
        agentSkills: 0,
        skillsShSkills: 0,
        totalFindings: 0,
        broadAccessFindings: 0
      }
    },
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: 0
    }
  };
}

test("App accepts a dataSource and re-renders when subscribe fires", async () => {
  let pushNext: ((next: MultiProjectScanResult) => void) | undefined;
  const initial = makeResult(["claude"]);
  const updated = makeResult(["claude", "codex"]);

  const dataSource = {
    initial,
    subscribe: (cb: (next: MultiProjectScanResult) => void) => {
      pushNext = cb;
      return () => {
        pushNext = undefined;
      };
    }
  };

  const { lastFrame, unmount } = render(<App dataSource={dataSource} />);
  // Sanity: first frame renders something with "1 detected".
  const firstFrame = lastFrame() ?? "";
  assert.ok(firstFrame.includes("1 detected"), `first frame should include "1 detected", got:\n${firstFrame}`);

  // Allow useEffect (which registers the subscription) to run after commit.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof pushNext, "function");
  pushNext!(updated);

  // After dispatch the next frame should show "2 detected".
  // Allow a microtask tick for React to commit.
  await new Promise((resolve) => setImmediate(resolve));
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("2 detected"), `expected updated frame to contain "2 detected", got:\n${frame}`);

  unmount();
});

test("App unsubscribes on unmount", async () => {
  let unsubscribed = false;
  const dataSource = {
    initial: makeResult([]),
    subscribe: (_cb: (next: MultiProjectScanResult) => void) => () => {
      unsubscribed = true;
    }
  };

  const { unmount } = render(<App dataSource={dataSource} />);
  // Let useEffect register the subscription before we unmount.
  await new Promise((resolve) => setImmediate(resolve));
  unmount();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(unsubscribed, true);
});

test("App still accepts the legacy `result` prop (back-compat)", () => {
  const { lastFrame, unmount } = render(<App result={makeResult(["claude"])} />);
  assert.ok((lastFrame() ?? "").length > 0, "renders something");
  unmount();
});
