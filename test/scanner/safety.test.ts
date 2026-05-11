import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MAX_SAFE_FILE_BYTES,
  isSensitivePath,
  safeReadTextFile
} from "../../src/scanner/safety.js";

test("sensitive filenames and directories are skipped", async () => {
  const workspace = await makeTempWorkspace();
  const sensitiveFiles = [
    ".env",
    "token.json",
    "credentials.json",
    "cookies.db",
    "session.json",
    "private.pem",
    "private.key",
    "nested/sessions/agent.md",
    ".opencode/cache/state.json"
  ];

  for (const relativePath of sensitiveFiles) {
    const filePath = path.join(workspace, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "secret");

    const result = await safeReadTextFile(filePath);

    assert.equal(result.ok, false, relativePath);
    assert.equal(result.warnings[0]?.reason, "sensitive_file_skipped", relativePath);
  }
});

test("normal config filenames with key in the name are not blocked", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, "keybindings.json");
  await fs.writeFile(filePath, "{}");

  const result = await safeReadTextFile(filePath);

  assert.equal(isSensitivePath(filePath), false);
  assert.equal(result.ok, true);
});

test("symlinks are skipped without following them", async () => {
  const workspace = await makeTempWorkspace();
  const targetPath = path.join(workspace, "safe.md");
  const symlinkPath = path.join(workspace, "linked.md");
  await fs.writeFile(targetPath, "safe");
  await fs.symlink(targetPath, symlinkPath);

  const result = await safeReadTextFile(symlinkPath);

  assert.equal(result.ok, false);
  assert.equal(result.warnings[0]?.reason, "symlink_skipped");
});

test("files larger than one MB are skipped", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, "large.md");
  await fs.writeFile(filePath, "x".repeat(MAX_SAFE_FILE_BYTES + 1));

  const result = await safeReadTextFile(filePath);

  assert.equal(result.ok, false);
  assert.equal(result.warnings[0]?.reason, "file_too_large");
});

test(
  "permission failures become permission_denied warnings",
  {
    skip:
      process.platform === "win32" || process.getuid?.() === 0
        ? "Permission bits are not reliable in this environment"
        : false
  },
  async () => {
    const workspace = await makeTempWorkspace();
    const filePath = path.join(workspace, "locked.md");
    await fs.writeFile(filePath, "locked");
    await fs.chmod(filePath, 0);

    try {
      const result = await safeReadTextFile(filePath);

      assert.equal(result.ok, false);
      assert.equal(result.warnings[0]?.reason, "permission_denied");
    } finally {
      await fs.chmod(filePath, 0o600);
    }
  }
);

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-safety-"));
}
