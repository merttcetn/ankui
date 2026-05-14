import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildLaunchTuiResult } from "../../src/commands/launch-tui.js";

// `buildLaunchTuiResult` is the test seam extracted from `launchTui`.
// It returns the `MultiProjectScanResult` that gets passed to `renderTui`.

test("buildLaunchTuiResult skips loadAllScans when devRoots is empty", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-launchtui-empty-"));
  const start = Date.now();
  const result = await buildLaunchTuiResult({ homeDir, env: {} });
  const elapsed = Date.now() - start;

  assert.equal(result.devRoots.length, 0);
  assert.equal(result.projects.length, 0);
  assert.equal(result.userScope.tools.length, 0);
  assert.equal(result.totals.userScopeSkills, 0);
  assert.equal(result.totals.projectCount, 0);
  // Empty path must complete in <1s — proves we bypassed the user-scope scan.
  assert.ok(elapsed < 1000, `Expected <1000ms for empty-config launch, got ${elapsed}ms`);
  // There should be a not_found warning surfaced from readDevRootsConfig.
  const reasons = result.warnings.map((w) => w.reason);
  assert.ok(
    reasons.includes("not_found"),
    `Expected not_found warning, got ${JSON.stringify(reasons)}`
  );
});

test("buildLaunchTuiResult runs loadAllScans when devRoots is populated", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-launchtui-pop-"));
  const configDir = path.join(homeDir, ".config", "ankui");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({ version: 1, devRoots: [homeDir] })
  );

  const result = await buildLaunchTuiResult({ homeDir, env: {} });

  assert.equal(result.devRoots.length, 1);
  // userScope is populated by loadAllScans (with createAllEmptyTools = 6 tools).
  assert.ok(Array.isArray(result.userScope.tools));
  assert.ok(result.userScope.tools.length > 0, "loadAllScans should populate userScope tools");
  // No `not_found` warning when config exists.
  const reasons = result.warnings.map((w) => w.reason);
  assert.equal(reasons.includes("not_found"), false);
});
