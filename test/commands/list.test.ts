import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runListCommand, InvalidFilterError } from "../../src/commands/list.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runListCommand prints all skills when no filter is provided", async () => {
  const cwd = await makeTempWorkspace("ankui-list-cwd-");
  const homeDir = await makeTempWorkspace("ankui-list-home-");
  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { postgres: { command: "pg" } } })
  );

  let captured = "";
  await runListCommand({
    json: false,
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /Ankui — 1 skill/);
  assert.match(captured, /cursor \(1\)/);
  assert.match(captured, /mcp_server.*Postgres/);
});

test("runListCommand applies --kind filter", async () => {
  const cwd = await makeTempWorkspace("ankui-list-kind-cwd-");
  const homeDir = await makeTempWorkspace("ankui-list-kind-home-");
  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { postgres: { command: "pg" } } })
  );

  let captured = "";
  await runListCommand({
    json: false,
    kind: "mcp_server",
    write: (chunk) => { captured += chunk; },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /1 mcp_server/);
});

test("runListCommand throws InvalidFilterError on unknown --kind", async () => {
  const cwd = await makeTempWorkspace("ankui-list-bad-cwd-");
  const homeDir = await makeTempWorkspace("ankui-list-bad-home-");

  await assert.rejects(
    runListCommand({
      json: false,
      kind: "totally-bogus",
      write: () => {},
      cwd,
      homeDir,
      env: {}
    }),
    (err: unknown) => err instanceof InvalidFilterError && /kind/.test((err as Error).message)
  );
});

test("runListCommand throws InvalidFilterError on unknown --tool", async () => {
  await assert.rejects(
    runListCommand({
      json: false,
      tool: "totally-bogus",
      write: () => {},
      cwd: "/tmp",
      homeDir: "/tmp",
      env: {}
    }),
    (err: unknown) => err instanceof InvalidFilterError && /tool/.test((err as Error).message)
  );
});
