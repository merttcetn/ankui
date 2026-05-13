import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runShowCommand } from "../../src/commands/show.js";
import { ToolNotFoundError } from "../../src/utils/format-show.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runShowCommand prints a detected tool's skill listing", async () => {
  const cwd = await makeTempWorkspace("ankui-show-cwd-");
  const homeDir = await makeTempWorkspace("ankui-show-home-");
  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { postgres: { command: "pg" } } })
  );

  let captured = "";
  await runShowCommand({
    toolId: "cursor",
    json: false,
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /^Ankui — cursor/);
  assert.match(captured, /Detected at:\n  user:\n    ~\/\.cursor/);
  assert.match(captured, /mcp_server \(1\)/);
  assert.match(captured, /Postgres.*database · broad/);
});

test("runShowCommand emits parseable JSON when json is true", async () => {
  const cwd = await makeTempWorkspace("ankui-show-json-cwd-");
  const homeDir = await makeTempWorkspace("ankui-show-json-home-");

  let captured = "";
  await runShowCommand({
    toolId: "claude",
    json: true,
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.equal(parsed.tool, "claude");
  assert.equal(parsed.detected, false);
  assert.ok(parsed.skillsByKind);
});

test("runShowCommand throws ToolNotFoundError on unknown tool", async () => {
  await assert.rejects(
    runShowCommand({
      toolId: "bogus",
      json: false,
      write: () => {},
      cwd: "/tmp",
      homeDir: "/tmp",
      env: {}
    }),
    (err: unknown) => err instanceof ToolNotFoundError
  );
});
