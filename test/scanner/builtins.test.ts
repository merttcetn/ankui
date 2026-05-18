import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scan } from "../../src/scanner/index.js";
import type { Skill } from "../../src/types.js";

async function makeIsolatedDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ankui-builtins-"));
}

function builtinsForTool(skills: Skill[], toolId: Skill["toolId"]): Skill[] {
  return skills.filter(
    (skill) => skill.toolId === toolId && skill.source === "builtin"
  );
}

test("scan() does not emit builtin skills by default", async () => {
  const dir = await makeIsolatedDir();
  const result = await scan({ cwd: dir, homeDir: dir, env: {} });
  const builtins = result.tools.flatMap((tool) =>
    tool.skills.filter((skill) => skill.source === "builtin")
  );
  assert.equal(builtins.length, 0);
});

test("scan({ showBuiltins: true }) injects the expected count per tool", async () => {
  const dir = await makeIsolatedDir();
  const result = await scan({
    cwd: dir,
    homeDir: dir,
    env: {},
    showBuiltins: true
  });
  const allSkills = result.tools.flatMap((tool) => tool.skills);

  assert.equal(builtinsForTool(allSkills, "claude").length, 9);
  assert.equal(builtinsForTool(allSkills, "codex").length, 7);
  assert.equal(builtinsForTool(allSkills, "gemini").length, 9);
  assert.equal(builtinsForTool(allSkills, "cursor").length, 0);
  assert.equal(builtinsForTool(allSkills, "opencode").length, 0);
  assert.equal(builtinsForTool(allSkills, "skills-sh").length, 0);
});

test("builtin skills carry the expected marker shape", async () => {
  const dir = await makeIsolatedDir();
  const result = await scan({
    cwd: dir,
    homeDir: dir,
    env: {},
    showBuiltins: true
  });

  const builtins = result.tools.flatMap((tool) =>
    tool.skills.filter((skill) => skill.source === "builtin")
  );

  assert.ok(builtins.length > 0);

  for (const skill of builtins) {
    assert.equal(skill.source, "builtin");
    assert.equal(skill.scope, "user");
    assert.equal(skill.details?.builtin, true);
    assert.ok(
      skill.sourcePath.startsWith("<builtin:"),
      `expected synthetic source marker, got ${skill.sourcePath}`
    );
  }
});

test("--show-builtins flips tool.detected even when nothing else found the tool", async () => {
  const dir = await makeIsolatedDir();
  const result = await scan({
    cwd: dir,
    homeDir: dir,
    env: {},
    showBuiltins: true
  });

  for (const toolId of ["claude", "codex", "gemini"] as const) {
    const tool = result.tools.find((entry) => entry.id === toolId);
    assert.ok(tool, `expected ${toolId} tool entry`);
    assert.equal(
      tool.detected,
      true,
      `${toolId} should be marked detected once builtins are injected`
    );
  }
});
