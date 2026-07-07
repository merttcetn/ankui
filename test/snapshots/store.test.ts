import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSnapshotId,
  deleteSnapshot,
  getSnapshotsDir,
  listSnapshots,
  readSnapshot,
  validateSnapshotLabel,
  writeSnapshot
} from "../../src/snapshots/store.js";
import type { SnapshotDocument } from "../../src/snapshots/types.js";

function document(id: string, createdAt: string): SnapshotDocument {
  return {
    version: 1,
    id,
    createdAt,
    projectCount: 0,
    tools: [],
    entities: [],
    findings: [],
    warnings: []
  };
}

test("snapshot store writes, resolves prefixes, and deletes", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-snapshot-store-"));
  const id = createSnapshotId(new Date("2026-07-06T10:00:00.000Z"));
  await writeSnapshot(home, document(id, "2026-07-06T10:00:00.000Z"));
  const dirMode = (await fs.stat(getSnapshotsDir(home))).mode & 0o777;
  const fileMode = (await fs.stat(path.join(getSnapshotsDir(home), `${id}.json`))).mode & 0o777;
  assert.equal(dirMode, 0o700);
  assert.equal(fileMode, 0o600);
  const listed = await listSnapshots(home);
  assert.equal(listed.snapshots.length, 1);
  assert.equal((await readSnapshot(home, id.slice(0, 20))).id, id);
  await deleteSnapshot(home, id);
  assert.equal((await listSnapshots(home)).snapshots.length, 0);
});

test("snapshot store retains only the newest 30 valid snapshots", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-snapshot-retain-"));
  for (let index = 0; index < 31; index += 1) {
    const now = new Date(Date.UTC(2026, 6, 6, 10, 0, index));
    const id = createSnapshotId(now);
    await writeSnapshot(home, document(id, now.toISOString()));
  }
  const listed = await listSnapshots(home);
  assert.equal(listed.snapshots.length, 30);
  assert.equal(listed.snapshots[0].createdAt, "2026-07-06T10:00:30.000Z");
  assert.equal(listed.snapshots.at(-1)?.createdAt, "2026-07-06T10:00:01.000Z");
});

test("malformed snapshot files are preserved and surfaced as warnings", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ankui-snapshot-bad-"));
  const dir = getSnapshotsDir(home);
  await fs.mkdir(dir, { recursive: true });
  const badPath = path.join(dir, "manual.json");
  await fs.writeFile(badPath, "{bad json", "utf8");
  const listed = await listSnapshots(home);
  assert.equal(listed.snapshots.length, 0);
  assert.equal(listed.warnings.length, 1);
  assert.equal(await fs.readFile(badPath, "utf8"), "{bad json");
});

test("snapshot labels are normalized and validated", () => {
  assert.equal(validateSnapshotLabel("  release baseline  "), "release baseline");
  assert.equal(validateSnapshotLabel("   "), undefined);
  assert.throws(() => validateSnapshotLabel("x".repeat(81)), /80 characters/);
  assert.throws(() => validateSnapshotLabel("bad\nlabel"), /control/);
});
