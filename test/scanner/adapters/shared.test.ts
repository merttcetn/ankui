import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  parseMarkdownFrontmatter,
  scanMarkdownSkillTree
} from "../../../src/scanner/adapters/shared.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-skill-tree-"));
}

async function writeSkill(parent: string, name: string, body = "# title"): Promise<void> {
  await fs.mkdir(path.join(parent, name), { recursive: true });
  await fs.writeFile(path.join(parent, name, "SKILL.md"), body);
}

test("scanMarkdownSkillTree returns active skills and skips .disabled/", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "active-1");
  await writeSkill(parent, "active-2");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.deepEqual(
    result.active.map((s) => s.sourcePath).sort(),
    [
      path.join(parent, "active-1", "SKILL.md"),
      path.join(parent, "active-2", "SKILL.md")
    ].sort()
  );
  assert.deepEqual(result.disabled, []);
});

test("scanMarkdownSkillTree separately surfaces .disabled/ children with details.disabled=true", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "still-on");
  await writeSkill(path.join(parent, ".disabled"), "turned-off");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.equal(result.active.length, 1);
  assert.equal(result.active[0].sourcePath, path.join(parent, "still-on", "SKILL.md"));

  assert.equal(result.disabled.length, 1);
  assert.equal(
    result.disabled[0].sourcePath,
    path.join(parent, ".disabled", "turned-off", "SKILL.md")
  );
  assert.equal(result.disabled[0].details?.disabled, true);
});

test("scanMarkdownSkillTree returns empty lists when the parent is missing", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.deepEqual(result.active, []);
  assert.deepEqual(result.disabled, []);
});

test("scanMarkdownSkillTree returns empty disabled list when .disabled/ is missing", async () => {
  const home = await tmp();
  const parent = path.join(home, ".claude", "skills");
  await fs.mkdir(parent, { recursive: true });
  await writeSkill(parent, "lonely");

  const result = await scanMarkdownSkillTree({
    parent,
    context: { cwd: home, homeDir: home }
  });

  assert.equal(result.active.length, 1);
  assert.deepEqual(result.disabled, []);
});

test("parseMarkdownFrontmatter recovers bracket-value frontmatter without warnings", () => {
  const text = `---
argument-hint: [--no-verify] [--style=simple|full] [--type=feat|fix|docs]
description: Create well-formatted commits with conventional commit messages
---

# Body
`;
  const result = parseMarkdownFrontmatter(text, "commit.md");

  assert.equal(result.warnings.length, 0);
  assert.equal(
    result.metadata.description,
    "Create well-formatted commits with conventional commit messages"
  );
  assert.equal(typeof result.metadata["argument-hint"], "string");
});

test("parseMarkdownFrontmatter recovers frontmatter with embedded XML examples", () => {
  const text = `---
name: dev-planner
description: Expert planner that breaks down stories into plans.

Examples:
- <example>
  Context: User wants X.
  user: "Plan it"
  assistant: "ok"
  <commentary>
  Since the user wants planning.
  </commentary>
</example>
model: sonnet
color: blue
---

Body
`;
  const result = parseMarkdownFrontmatter(text, "dev-planner.md");

  assert.equal(result.warnings.length, 0);
  assert.equal(result.metadata.name, "dev-planner");
  assert.equal(result.metadata.model, "sonnet");
  assert.equal(result.metadata.color, "blue");
});

test("parseMarkdownFrontmatter still warns when frontmatter has no extractable keys", () => {
  const text = `---
{ unclosed: bracket
  - dangling
---

Body
`;
  const result = parseMarkdownFrontmatter(text, "broken.md");

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.reason, "parse_failed");
});

test("parseMarkdownFrontmatter ignores lone YAML indicators as values", () => {
  const text = `---
name: [
---

Body
`;
  const result = parseMarkdownFrontmatter(text, "broken.md");

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.reason, "parse_failed");
  assert.deepEqual(result.metadata, {});
});

test("parseMarkdownFrontmatter still parses well-formed YAML normally", () => {
  const text = `---
name: my-skill
tools:
  - Read
  - Write
---

Body
`;
  const result = parseMarkdownFrontmatter(text, "valid.md");

  assert.equal(result.warnings.length, 0);
  assert.equal(result.metadata.name, "my-skill");
  assert.deepEqual(result.metadata.tools, ["Read", "Write"]);
});
