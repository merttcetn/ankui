import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MAX_SAFE_FILE_BYTES,
  checkSafePath,
  getLinkInfo,
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

test("symlinks within allowed roots are followed and marked linked", async () => {
  const workspace = await makeTempWorkspace();
  const targetPath = path.join(workspace, "safe.md");
  const symlinkPath = path.join(workspace, "linked.md");
  await fs.writeFile(targetPath, "safe");
  await fs.symlink(targetPath, symlinkPath);

  const result = await safeReadTextFile(symlinkPath, { allowedRoots: [workspace] });

  assert.equal(result.ok, true);
  assert.equal(result.value, "safe");
});

test("symlinks pointing outside allowed roots are skipped", async () => {
  const workspace = await makeTempWorkspace();
  const outsideTarget = await makeTempWorkspace();
  const targetPath = path.join(outsideTarget, "outside.md");
  const symlinkPath = path.join(workspace, "linked.md");
  await fs.writeFile(targetPath, "outside");
  await fs.symlink(targetPath, symlinkPath);

  const result = await safeReadTextFile(symlinkPath, { allowedRoots: [workspace] });

  assert.equal(result.ok, false);
  assert.equal(result.warnings[0]?.reason, "symlink_skipped");
});

test("symlinks whose resolved target hits a sensitive segment are skipped", async () => {
  const workspace = await makeTempWorkspace();
  const sensitiveDir = path.join(workspace, "sessions");
  const targetPath = path.join(sensitiveDir, "data.md");
  const symlinkPath = path.join(workspace, "linked.md");
  await fs.mkdir(sensitiveDir, { recursive: true });
  await fs.writeFile(targetPath, "session-data");
  await fs.symlink(targetPath, symlinkPath);

  const result = await safeReadTextFile(symlinkPath, { allowedRoots: [workspace] });

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

test("checkSafePath marks linked: true for symlinks within the allowlist", async () => {
  const workspace = await makeTempWorkspace();
  const targetDir = path.join(workspace, "src");
  const linkDir = path.join(workspace, "via-link");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.symlink(targetDir, linkDir, "dir");

  const result = await checkSafePath(linkDir, {
    expectedType: "directory",
    allowedRoots: [workspace]
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.linked, true);
    assert.equal(typeof result.value.linkTarget, "string");
  }
});

test("checkSafePath surfaces linked: true when an ancestor is a symlink", async () => {
  const workspace = await makeTempWorkspace();
  const realParent = path.join(workspace, "real-parent");
  const linkParent = path.join(workspace, "linked-parent");
  await fs.mkdir(realParent, { recursive: true });
  const realFile = path.join(realParent, "child.md");
  await fs.writeFile(realFile, "data");
  await fs.symlink(realParent, linkParent, "dir");

  const result = await checkSafePath(path.join(linkParent, "child.md"), {
    expectedType: "file",
    allowedRoots: [workspace]
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.linked, true);
  }
});

test("getLinkInfo returns linked: false for a regular file", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, "regular.md");
  await fs.writeFile(filePath, "ok");

  const info = await getLinkInfo(filePath);

  assert.equal(info.linked, false);
});

test("getLinkInfo reports linked + linkTarget for a real symlink", async () => {
  const workspace = await makeTempWorkspace();
  const targetPath = path.join(workspace, "real.md");
  const symlinkPath = path.join(workspace, "linked.md");
  await fs.writeFile(targetPath, "ok");
  await fs.symlink(targetPath, symlinkPath);

  const info = await getLinkInfo(symlinkPath);

  assert.equal(info.linked, true);
  assert.equal(typeof info.linkTarget, "string");
});

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-safety-"));
}
