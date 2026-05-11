import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonFile, readJsoncFile, readTomlFile } from "../../src/scanner/parsing.js";
import { createSanitizedPreview, readSanitizedPreview } from "../../src/scanner/preview.js";
import { MASKED_SECRET } from "../../src/scanner/safety.js";

test("JSON parsing masks env values and secret-like keys", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, "config.json");
  await fs.writeFile(
    filePath,
    JSON.stringify({
      mcpServers: {
        github: {
          command: "github-mcp",
          env: {
            GITHUB_TOKEN: "ghp_secretvalue"
          }
        }
      },
      apiKey: "sk-1234567890abcdefghijkl"
    })
  );

  const result = await readJsonFile(filePath);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    mcpServers: {
      github: {
        command: "github-mcp",
        env: {
          GITHUB_TOKEN: MASKED_SECRET
        }
      }
    },
    apiKey: MASKED_SECRET
  });
});

test("JSONC and TOML parsing return sanitized objects", async () => {
  const workspace = await makeTempWorkspace();
  const jsoncPath = path.join(workspace, "opencode.jsonc");
  const tomlPath = path.join(workspace, "config.toml");

  await fs.writeFile(
    jsoncPath,
    `{
      // comments are allowed
      "env": {
        "OPENAI_API_KEY": "sk-1234567890abcdefghijkl",
      },
    }`
  );
  await fs.writeFile(tomlPath, 'command = "codex"\npassword = "plain-secret"\n');

  const jsonc = await readJsoncFile(jsoncPath);
  const toml = await readTomlFile(tomlPath);

  assert.equal(jsonc.ok, true);
  assert.deepEqual(jsonc.value, {
    env: {
      OPENAI_API_KEY: MASKED_SECRET
    }
  });

  assert.equal(toml.ok, true);
  assert.deepEqual(toml.value, {
    command: "codex",
    password: MASKED_SECRET
  });
});

test("parse failures produce parse_failed warnings", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, "broken.json");
  await fs.writeFile(filePath, "{");

  const result = await readJsonFile(filePath);

  assert.equal(result.ok, false);
  assert.equal(result.warnings[0]?.reason, "parse_failed");
});

test("sanitized preview is limited to ten lines and masks token-like values", async () => {
  const text = Array.from({ length: 12 }, (_value, index) =>
    index === 2 ? "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz" : `line ${index + 1}`
  ).join("\n");

  const preview = createSanitizedPreview(text, "agent.md");

  assert.equal(preview.lines.length, 10);
  assert.equal(preview.truncated, true);
  assert.equal(preview.lines[2], `GITHUB_TOKEN=${MASKED_SECRET}`);
});

test("sanitized preview masks quoted JSON-style secret values", () => {
  const preview = createSanitizedPreview(
    '{\n  "GITHUB_TOKEN": "ghp_abcdefghijklmnopqrstuvwxyz"\n}',
    "config.json"
  );

  assert.equal(preview.lines[1], `  "GITHUB_TOKEN": "${MASKED_SECRET}"`);
});

test("sensitive files do not produce previews", async () => {
  const workspace = await makeTempWorkspace();
  const filePath = path.join(workspace, ".env");
  await fs.writeFile(filePath, "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz");

  const result = await readSanitizedPreview(filePath);

  assert.equal(result.ok, false);
  assert.equal(result.warnings[0]?.reason, "sensitive_file_skipped");
});

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-parsing-"));
}
