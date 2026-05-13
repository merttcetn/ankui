import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDoctorCommand } from "../../src/commands/doctor.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runDoctorCommand prints the human output with header and Tools section", async () => {
  const cwd = await makeTempWorkspace("ankui-doctor-cwd-");
  const homeDir = await makeTempWorkspace("ankui-doctor-home-");

  let captured = "";
  await runDoctorCommand({
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    cwd,
    homeDir,
    env: {}
  });

  assert.match(captured, /^Ankui doctor — 0 detected tools, 0 warnings/);
  assert.match(captured, /Tools\n─────\n/);
  assert.match(captured, /No warnings\./);
});

test("runDoctorCommand emits parseable JSON when json is true", async () => {
  const cwd = await makeTempWorkspace("ankui-doctor-json-cwd-");
  const homeDir = await makeTempWorkspace("ankui-doctor-json-home-");

  let captured = "";
  await runDoctorCommand({
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
  assert.equal(parsed.tools.length, 6);
  assert.equal(parsed.detectedToolCount, 0);
  assert.equal(parsed.warningCount, 0);
});
