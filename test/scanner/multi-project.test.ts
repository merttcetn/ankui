import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverProjects } from "../../src/scanner/multi-project.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("discoverProjects finds children with marker dirs", async () => {
  const root = await makeTempWorkspace("ankui-mp-root-");

  await fs.mkdir(path.join(root, "ankui", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "visa-prep", ".cursor"), { recursive: true });
  await fs.mkdir(path.join(root, "no-ai", "src"), { recursive: true });

  const result = await discoverProjects([root], os.homedir());

  const paths = result.projects.map((p) => p.projectPath).sort();
  assert.deepEqual(paths, [
    path.join(root, "ankui"),
    path.join(root, "visa-prep")
  ]);
  assert.equal(result.warnings.length, 0);
});

test("discoverProjects finds children with marker files", async () => {
  const root = await makeTempWorkspace("ankui-mp-files-");

  await fs.mkdir(path.join(root, "with-claude-md"), { recursive: true });
  await fs.writeFile(path.join(root, "with-claude-md", "CLAUDE.md"), "# x");
  await fs.mkdir(path.join(root, "with-agents-md"), { recursive: true });
  await fs.writeFile(path.join(root, "with-agents-md", "AGENTS.md"), "# x");
  await fs.mkdir(path.join(root, "with-mcp-json"), { recursive: true });
  await fs.writeFile(path.join(root, "with-mcp-json", ".mcp.json"), "{}");
  await fs.mkdir(path.join(root, "plain"), { recursive: true });
  await fs.writeFile(path.join(root, "plain", "README.md"), "# nope");

  const result = await discoverProjects([root], os.homedir());

  const names = result.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(names, ["with-agents-md", "with-claude-md", "with-mcp-json"]);
});

test("discoverProjects emits a warning when a devRoot does not exist", async () => {
  const missing = path.join(os.tmpdir(), `ankui-mp-missing-${Date.now()}`);

  const result = await discoverProjects([missing], os.homedir());

  assert.deepEqual(result.projects, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.reason, "permission_denied");
  assert.ok(result.warnings[0]!.message.includes(missing));
});

test("discoverProjects skips dotfile and non-directory children of a devRoot", async () => {
  const root = await makeTempWorkspace("ankui-mp-skip-");

  await fs.writeFile(path.join(root, ".DS_Store"), "");
  await fs.writeFile(path.join(root, "README.md"), "# top-level");
  await fs.mkdir(path.join(root, ".hidden-dir", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "visible", ".claude"), { recursive: true });

  const result = await discoverProjects([root], os.homedir());

  const names = result.projects.map((p) => path.basename(p.projectPath));
  assert.deepEqual(names, ["visible"]);
});

test("discoverProjects produces home-relative displayPath", async () => {
  const home = await makeTempWorkspace("ankui-mp-home-");
  const root = path.join(home, "Developer");

  await fs.mkdir(path.join(root, "ankui", ".claude"), { recursive: true });

  const result = await discoverProjects([root], home);

  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0]!.displayPath, "~/Developer/ankui");
});

test("discoverProjects deduplicates projects when devRoots overlap", async () => {
  const root1 = await makeTempWorkspace("ankui-mp-dup1-");
  await fs.mkdir(path.join(root1, "shared", ".claude"), { recursive: true });

  const result = await discoverProjects([root1, root1], os.homedir());

  assert.equal(result.projects.length, 1);
});

import { loadAllScans } from "../../src/scanner/multi-project.js";

test("loadAllScans returns userScope plus a ProjectScan per discovered project", async () => {
  const home = await makeTempWorkspace("ankui-loadall-home-");
  const root = path.join(home, "Developer");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "proj-a", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "proj-b", ".cursor"), { recursive: true });
  await fs.mkdir(path.join(root, "no-ai"), { recursive: true });

  const result = await loadAllScans({
    devRoots: [root],
    homeDir: home,
    env: {},
    now: new Date("2026-05-13T00:00:00.000Z")
  });

  assert.equal(result.scannedAt, "2026-05-13T00:00:00.000Z");
  assert.equal(result.homeDir, home);
  assert.deepEqual(result.devRoots, [root]);
  assert.equal(result.userScope.tools.length, 6);

  const names = result.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(names, ["proj-a", "proj-b"]);

  // Each project's ScanResult ran with cwd === projectPath, homeDir === home.
  for (const p of result.projects) {
    assert.equal(p.scan.cwd, p.projectPath);
    assert.equal(p.scan.homeDir, home);
  }

  // Totals reflect actual counts.
  assert.equal(result.totals.projectCount, 2);
  assert.equal(
    result.totals.skillsAcrossProjects,
    result.projects.reduce(
      (n, p) => n + p.scan.tools.reduce((m, t) => m + t.skills.length, 0),
      0
    )
  );
});

test("loadAllScans returns an empty projects array when devRoots is empty", async () => {
  const home = await makeTempWorkspace("ankui-loadall-empty-");
  const result = await loadAllScans({
    devRoots: [],
    homeDir: home,
    env: {}
  });
  assert.deepEqual(result.projects, []);
  assert.deepEqual(result.devRoots, []);
});

test("loadAllScans propagates discoverProjects warnings", async () => {
  const home = await makeTempWorkspace("ankui-loadall-warn-");
  const missing = path.join(os.tmpdir(), `ankui-missing-${Date.now()}`);

  const result = await loadAllScans({
    devRoots: [missing],
    homeDir: home,
    env: {}
  });

  assert.deepEqual(result.projects, []);
  assert.ok(result.warnings.some((w) => w.reason === "permission_denied"));
});

test("loadAllScans wraps each project scan in a per-project timeout", async () => {
  const home = await makeTempWorkspace("ankui-loadall-timeout-home-");
  const root = path.join(home, "Developer");
  await fs.mkdir(path.join(root, "proj-slow", ".claude"), { recursive: true });

  // Inject a fake scanner via the testing hook to simulate one project hanging.
  const calls: string[] = [];
  const result = await loadAllScans({
    devRoots: [root],
    homeDir: home,
    env: {},
    perProjectTimeoutMs: 25,
    __scanForTesting: async (opts) => {
      calls.push(opts.cwd ?? "");
      if (opts.cwd === path.join(root, "proj-slow")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return {
        scannedAt: new Date().toISOString(),
        cwd: opts.cwd ?? "",
        homeDir: opts.homeDir ?? "",
        tools: [],
        findings: [],
        warnings: [],
        summary: {
          detectedTools: 0,
          totalSkills: 0,
          totalMcpServers: 0,
          uniqueMcpServers: 0,
          customCommands: 0,
          customTools: 0,
          plugins: 0,
          memoryFiles: 0,
          agentSkills: 0,
          skillsShSkills: 0,
          totalFindings: 0,
          broadAccessFindings: 0
        }
      };
    }
  });

  // proj-slow scan timed out; project not included.
  assert.equal(result.projects.length, 0);
  // Warning recorded.
  assert.ok(
    result.warnings.some(
      (w) => w.reason === "adapter_timeout" && w.path === path.join(root, "proj-slow")
    ),
    `expected timeout warning, got ${JSON.stringify(result.warnings)}`
  );
  // Both userScope + project scan were attempted.
  assert.ok(calls.includes(path.join(root, "proj-slow")));
  assert.ok(calls.includes(home));
});

import { readDevRootsConfig } from "../../src/scanner/multi-project.js";

test("readDevRootsConfig returns empty devRoots + not_found warning when file missing", async () => {
  const home = await makeTempWorkspace("ankui-cfg-missing-");
  const result = await readDevRootsConfig(home);
  assert.deepEqual(result.devRoots, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.reason, "not_found");
  assert.match(result.warnings[0]!.message, /config\.json/);
});

test("readDevRootsConfig still emits permission_denied for EACCES", async () => {
  const home = await makeTempWorkspace("ankui-cfg-eacces-");
  const cfgDir = path.join(home, ".config", "ankui");
  await fs.mkdir(cfgDir, { recursive: true });
  const configPath = path.join(cfgDir, "config.json");
  await fs.writeFile(configPath, JSON.stringify({ version: 1, devRoots: [] }));
  // Strip read permission. Tests running as root will not exercise this branch.
  await fs.chmod(configPath, 0o000);

  try {
    const result = await readDevRootsConfig(home);
    assert.deepEqual(result.devRoots, []);
    if (result.warnings.length > 0) {
      assert.equal(result.warnings[0]!.reason, "permission_denied");
    }
  } finally {
    await fs.chmod(configPath, 0o644).catch(() => undefined);
  }
});

test("readDevRootsConfig parses a valid config", async () => {
  const home = await makeTempWorkspace("ankui-cfg-ok-");
  const cfgDir = path.join(home, ".config", "ankui");
  await fs.mkdir(cfgDir, { recursive: true });
  await fs.writeFile(
    path.join(cfgDir, "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/Users/x/Developer", "/Users/x/code"] })
  );

  const result = await readDevRootsConfig(home);
  assert.deepEqual(result.devRoots, ["/Users/x/Developer", "/Users/x/code"]);
  assert.equal(result.warnings.length, 0);
});

test("readDevRootsConfig emits parse_failed warning on malformed JSON", async () => {
  const home = await makeTempWorkspace("ankui-cfg-bad-");
  const cfgDir = path.join(home, ".config", "ankui");
  await fs.mkdir(cfgDir, { recursive: true });
  await fs.writeFile(path.join(cfgDir, "config.json"), "{ not json");

  const result = await readDevRootsConfig(home);
  assert.deepEqual(result.devRoots, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.reason, "parse_failed");
});

test("readDevRootsConfig ignores non-string entries in devRoots array", async () => {
  const home = await makeTempWorkspace("ankui-cfg-mixed-");
  const cfgDir = path.join(home, ".config", "ankui");
  await fs.mkdir(cfgDir, { recursive: true });
  await fs.writeFile(
    path.join(cfgDir, "config.json"),
    JSON.stringify({ version: 1, devRoots: ["/Users/x/Developer", 42, null, "/Users/x/code"] })
  );

  const result = await readDevRootsConfig(home);
  assert.deepEqual(result.devRoots, ["/Users/x/Developer", "/Users/x/code"]);
});

test("loadAllScans completes a 30-project synthetic layout under 30 seconds", async () => {
  const home = await makeTempWorkspace("ankui-scale-home-");
  const root = path.join(home, "Developer");
  await fs.mkdir(root, { recursive: true });

  // Create 30 minimal project directories. Each has a single .claude/ dir
  // plus a CLAUDE.md so both marker kinds fire.
  for (let i = 0; i < 30; i += 1) {
    const proj = path.join(root, `proj-${String(i).padStart(2, "0")}`);
    await fs.mkdir(path.join(proj, ".claude"), { recursive: true });
    await fs.writeFile(path.join(proj, "CLAUDE.md"), "# project");
  }

  const started = Date.now();
  const result = await loadAllScans({
    devRoots: [root],
    homeDir: home,
    env: {}
  });
  const elapsed = Date.now() - started;

  assert.equal(result.projects.length, 30, "should discover all 30 projects");
  assert.ok(
    elapsed < 30_000,
    `expected loadAllScans to finish 30 synthetic projects under 30s, took ${elapsed}ms`
  );
  // No project should have timed out — synthetic projects are empty.
  assert.equal(
    result.warnings.filter((w) => w.reason === "adapter_timeout").length,
    0
  );
});
