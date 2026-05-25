import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { gitClone, gitFetch, gitRevParse, gitCheckout, gitLogSubject, gitDiffNameStatus } from "../../src/bundles/git.js";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "ignore" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
    p.on("error", reject);
  });
}

async function fixtureRepo(): Promise<{ url: string; firstSha: string; secondSha: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-git-fix-"));
  await run("git", ["init", "--quiet", "--initial-branch=main"], dir);
  await run("git", ["config", "user.email", "t@t"], dir);
  await run("git", ["config", "user.name", "t"], dir);
  await fs.mkdir(path.join(dir, "autoplan"));
  await fs.writeFile(path.join(dir, "autoplan", "SKILL.md"), "---\nname: autoplan\n---\nhi\n");
  await run("git", ["add", "."], dir);
  await run("git", ["commit", "--quiet", "-m", "Initial"], dir);
  const first = await gitRevParse(dir, "HEAD");
  await fs.mkdir(path.join(dir, "new-skill"));
  await fs.writeFile(path.join(dir, "new-skill", "SKILL.md"), "---\nname: new-skill\n---\n");
  await run("git", ["add", "."], dir);
  await run("git", ["commit", "--quiet", "-m", "Add new-skill"], dir);
  const second = await gitRevParse(dir, "HEAD");
  return { url: dir, firstSha: first, secondSha: second };
}

test("gitClone shallow-clones a local repo and gitRevParse returns the SHA", async () => {
  const fix = await fixtureRepo();
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-clone-"));
  const target = path.join(dst, "foo", "skills");
  await gitClone({ url: fix.url, target, depth: 1 });
  const sha = await gitRevParse(target, "HEAD");
  assert.equal(sha, fix.secondSha);
});

test("gitLogSubject returns commit subject", async () => {
  const fix = await fixtureRepo();
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-clone-"));
  await gitClone({ url: fix.url, target: dst, depth: 1 });
  const subj = await gitLogSubject(dst, "HEAD");
  assert.equal(subj, "Add new-skill");
});

test("gitFetch + gitCheckout move HEAD between two commits", async () => {
  // Note: for this test we need a non-shallow clone so prior SHA is reachable.
  const fix = await fixtureRepo();
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-clone-"));
  await gitClone({ url: fix.url, target: dst, depth: 0 });   // 0 → full clone
  await gitFetch(dst);
  await gitCheckout(dst, fix.firstSha);
  const sha = await gitRevParse(dst, "HEAD");
  assert.equal(sha, fix.firstSha);
});

test("gitDiffNameStatus returns added/removed/modified entries between two SHAs", async () => {
  const fix = await fixtureRepo();
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-clone-"));
  await gitClone({ url: fix.url, target: dst, depth: 0 });
  const diff = await gitDiffNameStatus(dst, fix.firstSha, fix.secondSha);
  assert.deepEqual(diff.added.sort(), ["new-skill/SKILL.md"]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.modified, []);
});

test("gitClone surfaces a clear error on a non-existent URL", async () => {
  const dst = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "ankui-clone-")), "nope");
  await assert.rejects(
    () => gitClone({ url: "/no/such/path", target: dst, depth: 1 }),
    /git clone failed/
  );
});
