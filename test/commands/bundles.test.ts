import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runBundlesCommand } from "../../src/commands/bundles.js";
import { writeRegistry } from "../../src/bundles/registry.js";
import type { MultiProjectScanResult } from "../../src/types.js";

async function tmpHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-bl-"));
}

function emptyScan(): MultiProjectScanResult {
  const stamp = "2026-05-25T00:00:00.000Z";
  return {
    scannedAt: stamp,
    cwd: "/home/u",
    homeDir: "/home/u",
    devRoots: [],
    userScope: {
      scannedAt: stamp,
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: [],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 0,
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
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("ankui bundles prints one line per registered bundle", async () => {
  const home = await tmpHome();
  await writeRegistry(home, {
    version: 1,
    bundles: [
      {
        name: "foo/skills",
        url: "https://github.com/foo/skills",
        pinnedSha: "a".repeat(40),
        pinnedCommitMessage: "x",
        installedAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        scope: "user",
        installs: [
          { toolId: "claude", skillName: "autoplan", bundlePath: "x", symlinkPath: "y" },
          { toolId: "skills-sh", skillName: "autoplan", bundlePath: "x", symlinkPath: "z" }
        ]
      }
    ]
  });
  const r = await runBundlesCommand({
    homeDir: home,
    flags: {},
    loadScan: async () => emptyScan()
  });
  assert.equal(r.exitCode, 0);
  const out = r.stdout.join("\n");
  assert.match(out, /foo\/skills/);
  assert.match(out, /aaaaaaa/);
  assert.match(out, /1 skills × 2 tools/);
  assert.match(out, /user/);
  assert.match(out, /Tracked \(ankui add\)/);
});

test("ankui bundles --json emits tracked + detected arrays", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const r = await runBundlesCommand({
    homeDir: home,
    flags: { json: true },
    loadScan: async () => emptyScan()
  });
  const parsed = JSON.parse(r.stdout.join(""));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.tracked, []);
  assert.deepEqual(parsed.detected, []);
});

test("ankui bundles with no registry + no detected prints a friendly empty message", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const r = await runBundlesCommand({
    homeDir: home,
    flags: {},
    loadScan: async () => emptyScan()
  });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout.join("\n"), /no bundles/i);
});

test("ankui bundles lists detected bundles from the scanner when registry is empty", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const stamp = "2026-05-25T00:00:00.000Z";
  const scanWithGstack: MultiProjectScanResult = {
    ...emptyScan(),
    userScope: {
      scannedAt: stamp,
      cwd: "/home/u",
      homeDir: "/home/u",
      tools: [
        {
          id: "claude",
          name: "Claude",
          description: "",
          detected: true,
          detectedPaths: [],
          findings: [],
          warnings: [],
          stats: {
            mcpServers: 0, customCommands: 0, customAgents: 0, customPrompts: 0,
            customTools: 0, plugins: 0, rules: 0, memoryFiles: 0,
            agentSkills: 2, skillsShSkills: 0, findings: 0
          },
          skills: [
            {
              id: "skill-1",
              toolId: "claude",
              kind: "agent_skill",
              source: "directory",
              scope: "user",
              name: "autoplan",
              sourcePath: "/home/u/.claude/skills/autoplan/SKILL.md",
              capabilities: [],
              details: { bundleOrigin: { kind: "bundle", name: "gstack" } }
            },
            {
              id: "skill-2",
              toolId: "claude",
              kind: "agent_skill",
              source: "directory",
              scope: "user",
              name: "browse",
              sourcePath: "/home/u/.claude/skills/browse/SKILL.md",
              capabilities: [],
              details: { bundleOrigin: { kind: "bundle", name: "gstack" } }
            }
          ]
        }
      ],
      findings: [],
      warnings: [],
      summary: {
        detectedTools: 1, totalSkills: 2, totalMcpServers: 0, uniqueMcpServers: 0,
        customCommands: 0, customTools: 0, plugins: 0, memoryFiles: 0,
        agentSkills: 2, skillsShSkills: 0, totalFindings: 0, broadAccessFindings: 0
      }
    },
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 2 }
  };
  const r = await runBundlesCommand({
    homeDir: home,
    flags: {},
    loadScan: async () => scanWithGstack
  });
  assert.equal(r.exitCode, 0);
  const out = r.stdout.join("\n");
  assert.match(out, /Detected \(manually managed\)/);
  assert.match(out, /gstack/);
  assert.match(out, /2 skills × 1 tools/);
});

test("ankui bundles --json includes detected bundle records", async () => {
  const home = await tmpHome();
  await writeRegistry(home, { version: 1, bundles: [] });
  const stamp = "2026-05-25T00:00:00.000Z";
  const r = await runBundlesCommand({
    homeDir: home,
    flags: { json: true },
    loadScan: async () => ({
      ...emptyScan(),
      userScope: {
        ...emptyScan().userScope,
        tools: [{
          id: "claude", name: "Claude", description: "",
          detected: true, detectedPaths: [], findings: [], warnings: [],
          stats: {
            mcpServers: 0, customCommands: 0, customAgents: 0, customPrompts: 0,
            customTools: 0, plugins: 0, rules: 0, memoryFiles: 0,
            agentSkills: 1, skillsShSkills: 0, findings: 0
          },
          skills: [{
            id: "s", toolId: "claude", kind: "agent_skill", source: "directory",
            scope: "user", name: "n", sourcePath: "/p", capabilities: [],
            details: { bundleOrigin: { kind: "bundle", name: "superpowers" } }
          }]
        }]
      }
    })
  });
  const parsed = JSON.parse(r.stdout.join(""));
  assert.equal(parsed.detected.length, 1);
  assert.equal(parsed.detected[0].name, "superpowers");
  assert.equal(parsed.detected[0].totalSkills, 1);
});

test("ankui bundles hides detected bundles that are also tracked (no duplicates)", async () => {
  const home = await tmpHome();
  await writeRegistry(home, {
    version: 1,
    bundles: [{
      name: "foo/skills",
      url: "https://github.com/foo/skills",
      pinnedSha: "a".repeat(40), pinnedCommitMessage: "x",
      installedAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user", installs: []
    }]
  });
  const stamp = "2026-05-25T00:00:00.000Z";
  const r = await runBundlesCommand({
    homeDir: home,
    flags: { json: true },
    loadScan: async () => ({
      ...emptyScan(),
      userScope: {
        ...emptyScan().userScope,
        tools: [{
          id: "claude", name: "Claude", description: "",
          detected: true, detectedPaths: [], findings: [], warnings: [],
          stats: {
            mcpServers: 0, customCommands: 0, customAgents: 0, customPrompts: 0,
            customTools: 0, plugins: 0, rules: 0, memoryFiles: 0,
            agentSkills: 1, skillsShSkills: 0, findings: 0
          },
          skills: [{
            id: "s", toolId: "claude", kind: "agent_skill", source: "directory",
            scope: "user", name: "n", sourcePath: "/p", capabilities: [],
            // origin name matches the tracked entry → must NOT appear in detected
            details: { bundleOrigin: { kind: "bundle", name: "foo/skills" } }
          }]
        }]
      }
    })
  });
  const parsed = JSON.parse(r.stdout.join(""));
  assert.equal(parsed.tracked.length, 1);
  assert.equal(parsed.detected.length, 0);
});
