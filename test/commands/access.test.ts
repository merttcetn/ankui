import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAccessCommand } from "../../src/commands/access.js";
import { stripAnsi } from "../../src/utils/format-ui.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runAccessCommand writes the human formatter output when json is false", async () => {
  const cwd = await makeTempWorkspace("ankui-access-cwd-");
  const homeDir = await makeTempWorkspace("ankui-access-home-");

  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { shadcn: { command: "x" } } })
  );
  await fs.mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".codex", "config.toml"),
    '[mcp_servers.shadcn]\ncommand = "x"\n'
  );

  let captured = "";
  await runAccessCommand({
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /Ankui Access Review/);
  assert.match(captured, /Duplicate MCP servers/);
  assert.match(captured, /shadcn/);
});

test("runAccessCommand supports ANSI color for human output", async () => {
  const cwd = await makeTempWorkspace("ankui-access-color-cwd-");
  const homeDir = await makeTempWorkspace("ankui-access-color-home-");

  let captured = "";
  await runAccessCommand({
    json: false,
    color: true,
    write: (chunk) => {
      captured += chunk;
    },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(captured), /^Ankui Access Review\n/);
});

test("runAccessCommand emits parseable JSON when json is true", async () => {
  const cwd = await makeTempWorkspace("ankui-access-json-cwd-");
  const homeDir = await makeTempWorkspace("ankui-access-json-home-");

  let captured = "";
  await runAccessCommand({
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    cwd,
    homeDir,
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.equal(typeof parsed.scannedAt, "string");
  assert.ok(Array.isArray(parsed.findings));
  assert.equal(parsed.summary.totalFindings, parsed.findings.length);
});
