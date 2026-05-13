import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCapsCommand } from "../../src/commands/caps.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runCapsCommand prints the human formatter output when json is false", async () => {
  const cwd = await makeTempWorkspace("ankui-caps-cwd-");
  const homeDir = await makeTempWorkspace("ankui-caps-home-");

  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { postgres: { command: "pg" } } })
  );

  let captured = "";
  await runCapsCommand({
    json: false,
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /Ankui capabilities/);
  assert.match(captured, /database \(1\)/);
  assert.match(captured, /Postgres/);
});

test("runCapsCommand emits parseable JSON when json is true", async () => {
  const cwd = await makeTempWorkspace("ankui-caps-json-cwd-");
  const homeDir = await makeTempWorkspace("ankui-caps-json-home-");

  let captured = "";
  await runCapsCommand({
    json: true,
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.equal(typeof parsed.scannedAt, "string");
  assert.ok(Array.isArray(parsed.categories));
  assert.equal(parsed.totalClassifiedMcps, 0);
});
