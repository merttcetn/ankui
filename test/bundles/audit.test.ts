import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendAudit, type AuditEvent } from "../../src/bundles/audit.js";

async function tmpHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-audit-"));
}

test("appendAudit creates .history.jsonl and appends events", async () => {
  const home = await tmpHome();
  const ev1: AuditEvent = { ts: "2026-05-25T00:00:00.000Z", op: "add", name: "foo/skills", outcome: "ok" };
  const ev2: AuditEvent = { ts: "2026-05-25T01:00:00.000Z", op: "remove", name: "foo/skills", outcome: "ok" };
  await appendAudit(home, ev1);
  await appendAudit(home, ev2);
  const p = path.join(home, ".ankui", "bundles", ".history.jsonl");
  const raw = await fs.readFile(p, "utf8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].op, "add");
  assert.equal(lines[1].op, "remove");
});

test("appendAudit tolerates concurrent appends without corruption", async () => {
  const home = await tmpHome();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      appendAudit(home, { ts: new Date(i * 1000).toISOString(), op: "add", outcome: "ok" })
    )
  );
  const p = path.join(home, ".ankui", "bundles", ".history.jsonl");
  const raw = await fs.readFile(p, "utf8");
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, 20);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
});
