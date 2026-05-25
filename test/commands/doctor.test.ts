import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDoctorCommand } from "../../src/commands/doctor.js";
import { writeRegistry } from "../../src/bundles/registry.js";

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
  assert.equal(parsed.tools.length, 7);
  assert.equal(parsed.detectedToolCount, 0);
  assert.equal(parsed.warningCount, 0);
});

test("doctor reports bundle_dir_missing when registry has an orphan entry", async () => {
  const cwd = await makeTempWorkspace("ankui-doctor-orphan-cwd-");
  const homeDir = await makeTempWorkspace("ankui-doctor-orphan-home-");
  await writeRegistry(homeDir, {
    version: 1,
    bundles: [{
      name: "ghost/skills",
      url: "https://github.com/ghost/skills",
      pinnedSha: "a".repeat(40),
      pinnedCommitMessage: "x",
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user",
      installs: []
    }]
  });
  // No actual bundle dir created on disk.

  let captured = "";
  await runDoctorCommand({
    json: true,
    write: (chunk) => { captured += chunk; },
    cwd, homeDir, env: {}
  });

  const parsed = JSON.parse(captured);
  assert.ok(
    parsed.warnings.some((w: { reason: string }) => w.reason === "bundle_dir_missing"),
    "expected a bundle_dir_missing warning, got: " + JSON.stringify(parsed.warningsByReason)
  );
});

test("doctor reports symlink_missing when a registered install's symlink is absent", async () => {
  const cwd = await makeTempWorkspace("ankui-doctor-symmiss-cwd-");
  const homeDir = await makeTempWorkspace("ankui-doctor-symmiss-home-");
  const bundleDir = path.join(homeDir, ".ankui", "bundles", "foo", "skills");
  await fs.mkdir(bundleDir, { recursive: true });
  await writeRegistry(homeDir, {
    version: 1,
    bundles: [{
      name: "foo/skills",
      url: "https://github.com/foo/skills",
      pinnedSha: "a".repeat(40),
      pinnedCommitMessage: "x",
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user",
      installs: [{
        toolId: "claude",
        skillName: "autoplan",
        bundlePath: path.join(bundleDir, "autoplan/SKILL.md"),
        symlinkPath: path.join(homeDir, ".claude/skills/autoplan/SKILL.md")
      }]
    }]
  });

  let captured = "";
  await runDoctorCommand({
    json: true,
    write: (chunk) => { captured += chunk; },
    cwd, homeDir, env: {}
  });

  const parsed = JSON.parse(captured);
  assert.ok(
    parsed.warnings.some((w: { reason: string }) => w.reason === "symlink_missing"),
    "expected a symlink_missing warning, got: " + JSON.stringify(parsed.warningsByReason)
  );
});

test("doctor reports symlink_diverged when the registered symlink target no longer matches", async () => {
  const cwd = await makeTempWorkspace("ankui-doctor-diverged-cwd-");
  const homeDir = await makeTempWorkspace("ankui-doctor-diverged-home-");
  const bundleDir = path.join(homeDir, ".ankui", "bundles", "foo", "skills");
  const recordedBundlePath = path.join(bundleDir, "autoplan", "SKILL.md");
  const actualTarget = path.join(homeDir, "elsewhere", "SKILL.md");
  await fs.mkdir(path.dirname(actualTarget), { recursive: true });
  await fs.writeFile(actualTarget, "x");
  await fs.mkdir(bundleDir, { recursive: true });
  const symlinkPath = path.join(homeDir, ".claude/skills/autoplan/SKILL.md");
  await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
  await fs.symlink(actualTarget, symlinkPath);
  await writeRegistry(homeDir, {
    version: 1,
    bundles: [{
      name: "foo/skills",
      url: "https://github.com/foo/skills",
      pinnedSha: "a".repeat(40),
      pinnedCommitMessage: "x",
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      scope: "user",
      installs: [{
        toolId: "claude",
        skillName: "autoplan",
        bundlePath: recordedBundlePath,
        symlinkPath
      }]
    }]
  });

  let captured = "";
  await runDoctorCommand({
    json: true,
    write: (chunk) => { captured += chunk; },
    cwd, homeDir, env: {}
  });

  const parsed = JSON.parse(captured);
  assert.ok(
    parsed.warnings.some((w: { reason: string }) => w.reason === "symlink_diverged"),
    "expected a symlink_diverged warning, got: " + JSON.stringify(parsed.warningsByReason)
  );
});
