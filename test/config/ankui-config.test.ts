import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ANKUI_CONFIG_VERSION,
  getAnkuiConfigPath,
  mergeDevRoots,
  readAnkuiConfig,
  writeAnkuiConfig
} from "../../src/config/ankui-config.js";

async function makeTempHome(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("ANKUI_CONFIG_VERSION is 1 — must match Phase 8b's reader", () => {
  assert.equal(ANKUI_CONFIG_VERSION, 1);
});

test("getAnkuiConfigPath returns <home>/.config/ankui/config.json", () => {
  const home = "/Users/x";
  assert.equal(getAnkuiConfigPath(home), "/Users/x/.config/ankui/config.json");
});

test("readAnkuiConfig returns empty config with no warning when file is missing", async () => {
  const home = await makeTempHome("ankui-config-missing-");
  const result = await readAnkuiConfig(home);
  assert.deepEqual(result.config, { version: 1, devRoots: [] });
  assert.equal(result.warnings.length, 0);
});

test("readAnkuiConfig parses a valid file", async () => {
  const home = await makeTempHome("ankui-config-valid-");
  const dir = path.join(home, ".config", "ankui");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/a", "/b"] }, null, 2),
    "utf8"
  );
  const result = await readAnkuiConfig(home);
  assert.deepEqual(result.config.devRoots, ["/a", "/b"]);
});

test("readAnkuiConfig emits parse_failed warning on malformed JSON", async () => {
  const home = await makeTempHome("ankui-config-bad-json-");
  const dir = path.join(home, ".config", "ankui");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "config.json"), "{not json", "utf8");
  const result = await readAnkuiConfig(home);
  assert.deepEqual(result.config, { version: 1, devRoots: [] });
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.reason, "parse_failed");
});

test("readAnkuiConfig emits parse_failed warning when devRoots is not an array", async () => {
  const home = await makeTempHome("ankui-config-wrong-shape-");
  const dir = path.join(home, ".config", "ankui");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({ version: 1, devRoots: "nope" }),
    "utf8"
  );
  const result = await readAnkuiConfig(home);
  assert.deepEqual(result.config, { version: 1, devRoots: [] });
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.reason, "parse_failed");
});

test("writeAnkuiConfig creates the directory and writes JSON atomically", async () => {
  const home = await makeTempHome("ankui-config-write-");
  await writeAnkuiConfig({ version: 1, devRoots: ["/a", "/b"] }, home);
  const text = await fs.readFile(getAnkuiConfigPath(home), "utf8");
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed, { version: 1, devRoots: ["/a", "/b"] });
});

test("writeAnkuiConfig normalizes devRoots: dedup, trim, drop empties and non-strings", async () => {
  const home = await makeTempHome("ankui-config-normalize-");
  await writeAnkuiConfig(
    {
      version: 1,
      devRoots: [
        "/a",
        "/a", // dup
        "  /b  ", // trim
        "", // empty
        // @ts-expect-error — intentionally invalid input
        42, // non-string
        "/c"
      ]
    },
    home
  );
  const text = await fs.readFile(getAnkuiConfigPath(home), "utf8");
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.devRoots, ["/a", "/b", "/c"]);
});

test("writeAnkuiConfig overwrites an existing config", async () => {
  const home = await makeTempHome("ankui-config-overwrite-");
  await writeAnkuiConfig({ version: 1, devRoots: ["/a"] }, home);
  await writeAnkuiConfig({ version: 1, devRoots: ["/b"] }, home);
  const result = await readAnkuiConfig(home);
  assert.deepEqual(result.config.devRoots, ["/b"]);
});

test("mergeDevRoots preserves existing order and appends new entries in insertion order", () => {
  assert.deepEqual(
    mergeDevRoots(["/a", "/b"], ["/b", "/c", "/d"]),
    ["/a", "/b", "/c", "/d"]
  );
});

test("mergeDevRoots returns existing unchanged when no new entries", () => {
  assert.deepEqual(mergeDevRoots(["/a", "/b"], []), ["/a", "/b"]);
});

test("mergeDevRoots returns incoming when existing is empty", () => {
  assert.deepEqual(mergeDevRoots([], ["/a", "/b"]), ["/a", "/b"]);
});

test("mergeDevRoots deduplicates within incoming", () => {
  assert.deepEqual(mergeDevRoots([], ["/a", "/a", "/b"]), ["/a", "/b"]);
});
