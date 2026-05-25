import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { runAddCommand } from "../../src/commands/add.js";
import { readRegistry } from "../../src/bundles/registry.js";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "ignore" });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`))));
    p.on("error", reject);
  });
}

async function fixtureRepo(skills: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-fix-"));
  await run("git", ["init", "--quiet", "--initial-branch=main"], dir);
  await run("git", ["config", "user.email", "t@t"], dir);
  await run("git", ["config", "user.name", "t"], dir);
  for (const name of skills) {
    await fs.mkdir(path.join(dir, name));
    await fs.writeFile(path.join(dir, name, "SKILL.md"), `---\nname: ${name}\n---\nx\n`);
  }
  await run("git", ["add", "."], dir);
  await run("git", ["commit", "--quiet", "-m", "Initial"], dir);
  return dir;
}

test("ankui add against a local fixture: clones, installs symlinks, updates registry", async () => {
  const fixture = await fixtureRepo(["autoplan", "grill-me"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-home-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  const result = await runAddCommand({
    urlOrPath: fixture,
    flags: { yes: true, claude: true, allowFileUrl: true },
    homeDir: home,
    cwd: home
  });
  assert.equal(result.exitCode, 0);
  const reg = await readRegistry(home);
  assert.equal(reg.bundles.length, 1);
  assert.equal(reg.bundles[0].installs.length, 2);
  const link = await fs.readlink(path.join(home, ".claude", "skills", "autoplan", "SKILL.md"));
  assert.ok(link.length > 0);
});

test("ankui add refuses when URL already in registry", async () => {
  const fixture = await fixtureRepo(["autoplan"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-home-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await runAddCommand({ urlOrPath: fixture, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });
  const second = await runAddCommand({ urlOrPath: fixture, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });
  assert.notEqual(second.exitCode, 0);
  assert.match(second.stderr.join("\n"), /already installed/);
});

test("ankui add with conflict refuses by default and reports the conflict", async () => {
  const fixture = await fixtureRepo(["autoplan"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-home-"));
  // Pre-create a conflicting user file
  await fs.mkdir(path.join(home, ".claude", "skills", "autoplan"), { recursive: true });
  await fs.writeFile(path.join(home, ".claude", "skills", "autoplan", "SKILL.md"), "yours");
  const result = await runAddCommand({ urlOrPath: fixture, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr.join("\n"), /conflict/);
  const reg = await readRegistry(home);
  assert.equal(reg.bundles.length, 0);
});
