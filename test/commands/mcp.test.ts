import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runMcpCommand } from "../../src/commands/mcp.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runMcpCommand prints the human overview when json is false", async () => {
  const cwd = await makeTempWorkspace("ankui-mcp-cwd-");
  const homeDir = await makeTempWorkspace("ankui-mcp-home-");

  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { postgres: { command: "pg" } } })
  );

  let captured = "";
  await runMcpCommand({
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /Ankui MCP overview/);
  assert.match(captured, /Postgres  database · broad/);
  assert.match(captured, /  cursor    ~\/\.cursor\/mcp\.json/);
});

test("runMcpCommand emits parseable JSON when json is true", async () => {
  const cwd = await makeTempWorkspace("ankui-mcp-json-cwd-");
  const homeDir = await makeTempWorkspace("ankui-mcp-json-home-");

  let captured = "";
  await runMcpCommand({
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
  assert.ok(Array.isArray(parsed.servers));
  assert.equal(parsed.uniqueServers, parsed.servers.length);
});
