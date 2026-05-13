import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discover } from "../../src/scanner/discovery.js";
import { scan } from "../../src/scanner/index.js";
import type { ToolId } from "../../src/types.js";

test("discovers known user-level config paths", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");

  await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await fs.writeFile(path.join(homeDir, ".claude.json"), "{}");
  await fs.mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".gemini"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".config", "opencode"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".skills"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".config", "skills"), { recursive: true });

  const result = await discover({ cwd, homeDir, env: {} });

  assertToolPath(result.paths, "claude", path.join(homeDir, ".claude"));
  assertToolPath(result.paths, "claude", path.join(homeDir, ".claude.json"));
  assertToolPath(result.paths, "codex", path.join(homeDir, ".codex"));
  assertToolPath(result.paths, "cursor", path.join(homeDir, ".cursor"));
  assertToolPath(result.paths, "gemini", path.join(homeDir, ".gemini"));
  assertToolPath(result.paths, "opencode", path.join(homeDir, ".config", "opencode"));
  assertToolPath(result.paths, "skills-sh", path.join(homeDir, ".skills"));
  assertToolPath(result.paths, "skills-sh", path.join(homeDir, ".config", "skills"));
  assert.equal(result.warnings.length, 0);
});

test("discovers project-level config files and directories", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");

  await fs.writeFile(path.join(cwd, "CLAUDE.md"), "# Claude");
  await fs.writeFile(path.join(cwd, "CLAUDE.local.md"), "# Local Claude");
  await fs.writeFile(path.join(cwd, "AGENTS.md"), "# Agents");
  await fs.writeFile(path.join(cwd, "GEMINI.md"), "# Gemini");
  await fs.writeFile(path.join(cwd, "opencode.json"), "{}");
  await fs.writeFile(path.join(cwd, "opencode.jsonc"), "{}");
  await fs.writeFile(path.join(cwd, ".cursorrules"), "rules");
  await fs.writeFile(path.join(cwd, ".mcp.json"), "{}");
  await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".cursor"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".gemini"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".codex"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".opencode"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".skills"), { recursive: true });

  const result = await discover({ cwd, homeDir, env: {} });

  assertToolPath(result.paths, "claude", path.join(cwd, "CLAUDE.md"));
  assertToolPath(result.paths, "claude", path.join(cwd, "CLAUDE.local.md"));
  assertToolPath(result.paths, "codex", path.join(cwd, "AGENTS.md"));
  assertToolPath(result.paths, "opencode", path.join(cwd, "AGENTS.md"));
  assertToolPath(result.paths, "gemini", path.join(cwd, "GEMINI.md"));
  assertToolPath(result.paths, "opencode", path.join(cwd, "opencode.json"));
  assertToolPath(result.paths, "opencode", path.join(cwd, "opencode.jsonc"));
  assertToolPath(result.paths, "cursor", path.join(cwd, ".cursorrules"));
  assertToolPath(result.paths, "claude", path.join(cwd, ".mcp.json"));
  assertToolPath(result.paths, "cursor", path.join(cwd, ".mcp.json"));
  assertToolPath(result.paths, "skills-sh", path.join(cwd, ".skills"));
});

test("project file discovery respects gitignore", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");

  await fs.writeFile(path.join(cwd, ".gitignore"), ".mcp.json\n.opencode/\n");
  await fs.writeFile(path.join(cwd, ".mcp.json"), "{}");
  await fs.mkdir(path.join(cwd, ".opencode"), { recursive: true });

  const result = await discover({ cwd, homeDir, env: {} });

  assertNoToolPath(result.paths, "cursor", path.join(cwd, ".mcp.json"));
  assertNoToolPath(result.paths, "claude", path.join(cwd, ".mcp.json"));
  assertNoToolPath(result.paths, "opencode", path.join(cwd, ".opencode"));
});

test("gitignored directory contents globs hide root directory candidates", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");

  await fs.writeFile(path.join(cwd, ".gitignore"), ".opencode/**\n.cursor/*\n");
  await fs.mkdir(path.join(cwd, ".opencode"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".cursor"), { recursive: true });

  const result = await discover({ cwd, homeDir, env: {} });

  assertNoToolPath(result.paths, "opencode", path.join(cwd, ".opencode"));
  assertNoToolPath(result.paths, "cursor", path.join(cwd, ".cursor"));
});

test("sensitive parent directory names do not hide safe candidates", async () => {
  const root = await makeTempWorkspace("ankui-discovery-parent-");
  const cwd = path.join(root, "history", "auth-service");
  const homeDir = path.join(root, "auth-home");

  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });
  await fs.writeFile(path.join(cwd, "CLAUDE.md"), "# Claude");
  await fs.mkdir(path.join(cwd, ".codex"), { recursive: true });
  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });

  const result = await discover({ cwd, homeDir, env: {} });

  assertToolPath(result.paths, "claude", path.join(cwd, "CLAUDE.md"));
  assertToolPath(result.paths, "codex", path.join(cwd, ".codex"));
  assertToolPath(result.paths, "cursor", path.join(homeDir, ".cursor"));
  assert.equal(
    result.warnings.some((warning) => warning.reason === "sensitive_file_skipped"),
    false
  );
});

test(
  "symlinked known paths resolving within the home directory are followed",
  {
    skip: process.platform === "win32" ? "Symlink creation is environment-dependent on Windows" : false
  },
  async () => {
    const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
    const homeDir = await makeTempWorkspace("ankui-discovery-home-");
    const targetPath = path.join(homeDir, "real-claude");
    const symlinkPath = path.join(homeDir, ".claude");

    await fs.mkdir(targetPath, { recursive: true });
    await fs.symlink(targetPath, symlinkPath, "dir");

    const result = await discover({ cwd, homeDir, env: {} });

    assertToolPath(result.paths, "claude", symlinkPath);
    assert.equal(
      result.warnings.some((warning) => warning.reason === "symlink_skipped"),
      false
    );
  }
);

test("discovers safe local OpenCode env paths", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");
  const configPath = path.join(cwd, "custom-opencode.json");
  const configDir = path.join(homeDir, "opencode-config");

  await fs.writeFile(configPath, "{}");
  await fs.mkdir(configDir, { recursive: true });

  const result = await discover({
    cwd,
    homeDir,
    env: {
      OPENCODE_CONFIG: configPath,
      OPENCODE_CONFIG_DIR: "~/opencode-config"
    }
  });

  assertToolPath(result.paths, "opencode", configPath);
  assertToolPath(result.paths, "opencode", configDir);
  assert.equal(result.paths.find((entry) => entry.path === configPath)?.scope, "project");
  assert.equal(result.paths.find((entry) => entry.path === configDir)?.scope, "user");
});

test("skips non-disk and remote OpenCode env config without leaking values", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");
  const inlineConfig = "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz";

  const result = await discover({
    cwd,
    homeDir,
    env: {
      OPENCODE_CONFIG: "https://example.com/opencode.json",
      OPENCODE_CONFIG_CONTENT: inlineConfig
    }
  });

  assert.ok(result.warnings.some((warning) => warning.reason === "remote_reference_skipped"));
  assert.ok(result.warnings.some((warning) => warning.reason === "non_disk_config_skipped"));
  assert.equal(JSON.stringify(result).includes(inlineConfig), false);
});

test("discovery does not include session or history directory contents", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");
  const sessionFile = path.join(cwd, ".opencode", "session", "AGENTS.md");
  const historyFile = path.join(cwd, "history", "CLAUDE.md");

  await fs.mkdir(path.dirname(sessionFile), { recursive: true });
  await fs.mkdir(path.dirname(historyFile), { recursive: true });
  await fs.writeFile(sessionFile, "# Session");
  await fs.writeFile(historyFile, "# History");

  const result = await discover({ cwd, homeDir, env: {} });

  assert.equal(result.paths.some((entry) => entry.path === sessionFile), false);
  assert.equal(result.paths.some((entry) => entry.path === historyFile), false);
});

test("scan marks tools detected from discovered paths", async () => {
  const cwd = await makeTempWorkspace("ankui-discovery-cwd-");
  const homeDir = await makeTempWorkspace("ankui-discovery-home-");

  await fs.writeFile(path.join(cwd, "CLAUDE.md"), "# Claude");
  await fs.writeFile(path.join(cwd, "AGENTS.md"), "# Agents");
  await fs.writeFile(path.join(cwd, "GEMINI.md"), "# Gemini");
  await fs.writeFile(path.join(cwd, ".mcp.json"), "{}");
  await fs.mkdir(path.join(cwd, ".skills"), { recursive: true });

  const result = await scan({
    cwd,
    homeDir,
    env: {},
    now: new Date("2026-05-12T00:00:00.000Z")
  });

  assert.equal(result.summary.detectedTools, 6);
  assert.equal(tool(result, "claude").detected, true);
  assert.equal(tool(result, "codex").detected, true);
  assert.equal(tool(result, "cursor").detected, true);
  assert.equal(tool(result, "gemini").detected, true);
  assert.equal(tool(result, "opencode").detected, true);
  assert.equal(tool(result, "skills-sh").detected, true);
  assertToolPath(tool(result, "claude").detectedPaths, "claude", path.join(cwd, "CLAUDE.md"));
});

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function assertToolPath(
  paths: Array<{ toolId: ToolId; path: string }> | string[],
  toolId: ToolId,
  expectedPath: string
): void {
  if (typeof paths[0] === "string") {
    assert.ok((paths as string[]).includes(expectedPath), expectedPath);
    return;
  }

  assert.ok(
    (paths as Array<{ toolId: ToolId; path: string }>).some(
      (entry) => entry.toolId === toolId && entry.path === expectedPath
    ),
    `${toolId} should include ${expectedPath}`
  );
}

function assertNoToolPath(
  paths: Array<{ toolId: ToolId; path: string }>,
  toolId: ToolId,
  expectedPath: string
): void {
  assert.equal(
    paths.some((entry) => entry.toolId === toolId && entry.path === expectedPath),
    false,
    `${toolId} should not include ${expectedPath}`
  );
}

function tool(result: Awaited<ReturnType<typeof scan>>, toolId: ToolId) {
  const foundTool = result.tools.find((entry) => entry.id === toolId);

  assert.ok(foundTool, `Missing tool ${toolId}`);
  return foundTool;
}
