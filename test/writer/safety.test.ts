import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkRenameSafety } from "../../src/writer/safety.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-writer-safety-"));
}

test("checkRenameSafety passes when source exists, target absent, both inside allowed roots", async () => {
  const home = await tmp();
  const source = path.join(home, "active");
  const target = path.join(home, ".disabled", "active");
  await fs.mkdir(source, { recursive: true });

  const result = await checkRenameSafety({ source, target, allowedRoots: [home] });
  assert.equal(result.ok, true);
});

test("checkRenameSafety fails with reason=source_missing when source does not exist", async () => {
  const home = await tmp();
  const result = await checkRenameSafety({
    source: path.join(home, "nope"),
    target: path.join(home, ".disabled", "nope"),
    allowedRoots: [home]
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "source_missing");
});

test("checkRenameSafety fails with reason=target_exists when target already present", async () => {
  const home = await tmp();
  const source = path.join(home, "active");
  const target = path.join(home, ".disabled", "active");
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(target, { recursive: true });
  const result = await checkRenameSafety({ source, target, allowedRoots: [home] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "target_exists");
});

test("checkRenameSafety fails with reason=outside_allowed_roots when target escapes", async () => {
  const home = await tmp();
  const outside = await tmp();
  const source = path.join(home, "active");
  await fs.mkdir(source, { recursive: true });
  const result = await checkRenameSafety({
    source,
    target: path.join(outside, "active"),
    allowedRoots: [home]
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "outside_allowed_roots");
});
