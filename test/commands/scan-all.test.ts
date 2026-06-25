import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runScanAllCommand } from "../../src/commands/scan-all.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("runScanAllCommand prints human summary with header when no dev roots are configured", async () => {
  const home = await makeTempWorkspace("ankui-scanall-home-");

  let captured = "";
  await runScanAllCommand({
    json: false,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    env: {}
  });

  assert.match(captured, /^Ankui Multi-project Scan\n/);
  assert.match(captured, /No dev roots registered\./);
});

test("runScanAllCommand reads devRoots from ~/.config/ankui/config.json when not provided", async () => {
  const home = await makeTempWorkspace("ankui-scanall-cfg-home-");
  const root = path.join(home, "Developer");
  await fs.mkdir(path.join(root, "proj", ".claude"), { recursive: true });

  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    JSON.stringify({ version: 1, devRoots: [root] })
  );

  let captured = "";
  await runScanAllCommand({
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.deepEqual(parsed.devRoots, [root]);
  assert.equal(parsed.projects.length, 1);
  assert.equal(path.basename(parsed.projects[0].projectPath), "proj");
});

test("runScanAllCommand honors an explicit devRoots option over the config file", async () => {
  const home = await makeTempWorkspace("ankui-scanall-override-home-");
  const root = path.join(home, "Developer");
  await fs.mkdir(path.join(root, "proj-a", ".claude"), { recursive: true });

  // Write a config that points to a nonexistent root, then override with the real one.
  await fs.mkdir(path.join(home, ".config", "ankui"), { recursive: true });
  await fs.writeFile(
    path.join(home, ".config", "ankui", "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/nope/never"] })
  );

  let captured = "";
  await runScanAllCommand({
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    devRoots: [root],
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.deepEqual(parsed.devRoots, [root]);
  assert.equal(parsed.projects.length, 1);
});

test("runScanAllCommand emits JSON shape with totals and warnings keys present", async () => {
  const home = await makeTempWorkspace("ankui-scanall-shape-home-");

  let captured = "";
  await runScanAllCommand({
    json: true,
    write: (chunk) => {
      captured += chunk;
    },
    homeDir: home,
    devRoots: [],
    env: {}
  });

  const parsed = JSON.parse(captured);
  assert.ok("scannedAt" in parsed);
  assert.ok("homeDir" in parsed);
  assert.ok("devRoots" in parsed);
  assert.ok("userScope" in parsed);
  assert.ok("projects" in parsed);
  assert.ok("warnings" in parsed);
  assert.ok("totals" in parsed);
  assert.equal(typeof parsed.totals.projectCount, "number");
  assert.equal(typeof parsed.totals.skillsAcrossProjects, "number");
  assert.equal(typeof parsed.totals.userScopeSkills, "number");
});
