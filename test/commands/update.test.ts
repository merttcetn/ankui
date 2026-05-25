import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { runAddCommand } from "../../src/commands/add.js";
import { runUpdateCommand } from "../../src/commands/update.js";
import { readRegistry } from "../../src/bundles/registry.js";

function gitRun(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, { cwd, stdio: "ignore" });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`git ${args.join(" ")} exited ${c}`))));
    p.on("error", reject);
  });
}

async function seedFixture(initialSkills: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-up-"));
  await gitRun(["init", "--quiet", "--initial-branch=main"], dir);
  await gitRun(["config", "user.email", "t@t"], dir);
  await gitRun(["config", "user.name", "t"], dir);
  for (const s of initialSkills) {
    await fs.mkdir(path.join(dir, s));
    await fs.writeFile(path.join(dir, s, "SKILL.md"), `---\nname: ${s}\n---\n`);
  }
  await gitRun(["add", "."], dir);
  await gitRun(["commit", "--quiet", "-m", "Initial"], dir);
  return dir;
}

test("ankui update detects 'up to date' when no upstream changes", async () => {
  const fix = await seedFixture(["autoplan"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-uh-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await runAddCommand({ urlOrPath: fix, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });
  const r = await runUpdateCommand({ name: "local/" + path.basename(fix), flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout.join("\n"), /up to date/i);
});

test("ankui update applies an upstream add (new skill)", async () => {
  const fix = await seedFixture(["autoplan"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-uh-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await runAddCommand({ urlOrPath: fix, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });

  // Add a new skill upstream
  await fs.mkdir(path.join(fix, "new-skill"));
  await fs.writeFile(path.join(fix, "new-skill", "SKILL.md"), "---\nname: new-skill\n---\n");
  await gitRun(["add", "."], fix);
  await gitRun(["commit", "--quiet", "-m", "Add new-skill"], fix);

  const name = "local/" + path.basename(fix);
  const r = await runUpdateCommand({ name, flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  await fs.lstat(path.join(home, ".claude", "skills", "new-skill", "SKILL.md")); // exists
  const reg = await readRegistry(home);
  const entry = reg.bundles.find((b) => b.name === name)!;
  assert.equal(entry.installs.length, 2);
});

test("ankui update applies an upstream remove (skill deleted)", async () => {
  const fix = await seedFixture(["autoplan", "remove-me"]);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-uh-"));
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  await runAddCommand({ urlOrPath: fix, flags: { yes: true, claude: true, allowFileUrl: true }, homeDir: home, cwd: home });

  await fs.rm(path.join(fix, "remove-me"), { recursive: true });
  await gitRun(["add", "-A"], fix);
  await gitRun(["commit", "--quiet", "-m", "Remove remove-me"], fix);

  const name = "local/" + path.basename(fix);
  const r = await runUpdateCommand({ name, flags: { yes: true }, homeDir: home, cwd: home });
  assert.equal(r.exitCode, 0);
  await assert.rejects(() => fs.lstat(path.join(home, ".claude", "skills", "remove-me", "SKILL.md")), /ENOENT/);
  const reg = await readRegistry(home);
  const entry = reg.bundles.find((b) => b.name === name)!;
  assert.equal(entry.installs.length, 1);
});
