import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDiscoverCommand } from "../../src/commands/discover.js";
import { getAnkuiConfigPath, readAnkuiConfig } from "../../src/config/ankui-config.js";

async function makeTempHome(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedThreeProjectsUnderDeveloper(home: string): Promise<string> {
  const dev = path.join(home, "Developer");
  for (const name of ["alpha", "beta", "gamma"]) {
    await fs.mkdir(path.join(dev, name, ".claude"), { recursive: true });
  }
  return dev;
}

test("runDiscoverCommand dry-run prints summary and does NOT write the config", async () => {
  const home = await makeTempHome("ankui-discover-dry-");
  await seedThreeProjectsUnderDeveloper(home);

  let captured = "";
  await runDiscoverCommand({
    apply: false,
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home
  });

  assert.match(captured, /^Ankui discover — crawl of ~ in/);
  assert.match(captured, /Default-ON dev roots \(1\)/);
  assert.match(captured, /3 projects/);
  assert.match(captured, /Re-run with --apply/);

  // Config file must not exist.
  await assert.rejects(
    fs.access(getAnkuiConfigPath(home)),
    /ENOENT/,
    "dry-run must not create config.json"
  );
});

test("runDiscoverCommand --apply writes the default-ON roots", async () => {
  const home = await makeTempHome("ankui-discover-apply-");
  const dev = await seedThreeProjectsUnderDeveloper(home);

  let captured = "";
  await runDiscoverCommand({
    apply: true,
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home
  });

  assert.match(captured, /Wrote 1 dev root\(s\) to/);

  const after = await readAnkuiConfig(home);
  assert.deepEqual(after.config.devRoots, [dev]);
});

test("runDiscoverCommand --apply is a no-op when the config already lists the roots", async () => {
  const home = await makeTempHome("ankui-discover-noop-");
  const dev = await seedThreeProjectsUnderDeveloper(home);

  // Pre-seed config.
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    getAnkuiConfigPath(home),
    JSON.stringify({ version: 1, devRoots: [dev] }, null, 2),
    "utf8"
  );
  const mtimeBefore = (await fs.stat(getAnkuiConfigPath(home))).mtimeMs;

  // Small delay so a re-write would be detectable.
  await new Promise((resolve) => setTimeout(resolve, 25));

  let captured = "";
  await runDiscoverCommand({
    apply: true,
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home
  });

  assert.match(captured, /Config already up to date — no changes written\./);
  const mtimeAfter = (await fs.stat(getAnkuiConfigPath(home))).mtimeMs;
  assert.equal(mtimeAfter, mtimeBefore, "config mtime must not change on no-op");
});

test("runDiscoverCommand --json emits a parseable payload with stats and candidates", async () => {
  const home = await makeTempHome("ankui-discover-json-");
  await seedThreeProjectsUnderDeveloper(home);

  let captured = "";
  await runDiscoverCommand({
    apply: false,
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home
  });

  const parsed = JSON.parse(captured);
  assert.equal(typeof parsed.scannedAt, "string");
  assert.equal(parsed.homeDir, home);
  assert.equal(parsed.configPath, getAnkuiConfigPath(home));
  assert.equal(parsed.stats.projectsFound, 3);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].projectCount, 3);
  assert.equal(parsed.candidates[0].defaultOn, true);
  assert.equal(parsed.applied, false);
});

test("runDiscoverCommand handles a home with no AI projects", async () => {
  const home = await makeTempHome("ankui-discover-empty-");
  // Just a plain directory — no markers.
  await fs.mkdir(path.join(home, "Documents"), { recursive: true });

  let captured = "";
  await runDiscoverCommand({
    apply: false,
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home
  });

  assert.match(captured, /No projects found\./);
});
