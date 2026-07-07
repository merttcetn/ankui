import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  crawlForProjects,
  DEFAULT_CRAWL_CONCURRENCY,
  DEFAULT_MARKER_DIRS,
  DEFAULT_MARKER_FILES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_SKIP_NAMES
} from "../../src/scanner/filesystem-crawler.js";

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("DEFAULT_MAX_DEPTH is 6 to cover ~/work/employer/team/service/repo/.claude", () => {
  assert.equal(DEFAULT_MAX_DEPTH, 6);
});

test("DEFAULT_CRAWL_CONCURRENCY is 16", () => {
  assert.equal(DEFAULT_CRAWL_CONCURRENCY, 16);
});

test("DEFAULT_SKIP_NAMES contains every directory from the TUI design spec", () => {
  const expected = [
    // macOS junk
    "Library", "Music", "Pictures", "Movies", "Applications", "Public", ".Trash",
    // Package caches
    "node_modules", ".npm", ".pnpm-store", ".yarn", ".cache", ".cargo", ".rustup", ".gem", ".go",
    // Dev clutter
    ".local", ".config", "vendor", ".venv", "venv", "__pycache__", ".next", ".nuxt", ".svelte-kit",
    "dist", "build", "target",
    // Build/IDE
    ".idea", ".vscode", ".gradle", ".m2"
  ];
  for (const name of expected) {
    assert.ok(DEFAULT_SKIP_NAMES.has(name), `expected DEFAULT_SKIP_NAMES to contain ${name}`);
  }
});

test("DEFAULT_MARKER_DIRS lists every AI tool directory marker", () => {
  const expected = [".claude", ".codex", ".cursor", ".gemini", ".opencode", ".skills"];
  for (const name of expected) {
    assert.ok(DEFAULT_MARKER_DIRS.has(name), `expected DEFAULT_MARKER_DIRS to contain ${name}`);
  }
  assert.equal(DEFAULT_MARKER_DIRS.size, expected.length);
});

test("DEFAULT_MARKER_FILES lists every AI tool file marker", () => {
  const expected = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".cursorrules",
    ".mcp.json",
    "opencode.json",
    "opencode.jsonc"
  ];
  for (const name of expected) {
    assert.ok(DEFAULT_MARKER_FILES.has(name), `expected DEFAULT_MARKER_FILES to contain ${name}`);
  }
  assert.equal(DEFAULT_MARKER_FILES.size, expected.length);
});

test("crawlForProjects detects direct children with a marker directory", async () => {
  const root = await makeTempWorkspace("ankui-crawl-md-");

  await fs.mkdir(path.join(root, "ankui", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "visa-prep", ".cursor"), { recursive: true });
  await fs.mkdir(path.join(root, "plain", "src"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 1 });

  const paths = result.projects.map((p) => p.projectPath).sort();
  assert.deepEqual(paths, [
    path.join(root, "ankui"),
    path.join(root, "visa-prep")
  ]);
});

test("crawlForProjects detects direct children with a marker file", async () => {
  const root = await makeTempWorkspace("ankui-crawl-mf-");

  await fs.mkdir(path.join(root, "with-claude-md"), { recursive: true });
  await fs.writeFile(path.join(root, "with-claude-md", "CLAUDE.md"), "# x");
  await fs.mkdir(path.join(root, "with-mcp"), { recursive: true });
  await fs.writeFile(path.join(root, "with-mcp", ".mcp.json"), "{}");
  await fs.mkdir(path.join(root, "no-markers"), { recursive: true });
  await fs.writeFile(path.join(root, "no-markers", "README.md"), "# nope");

  const result = await crawlForProjects({ rootDir: root, maxDepth: 1 });

  const names = result.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(names, ["with-claude-md", "with-mcp"]);
});

test("crawlForProjects records the marker basenames that matched", async () => {
  const root = await makeTempWorkspace("ankui-crawl-markers-");

  await fs.mkdir(path.join(root, "multi", ".claude"), { recursive: true });
  await fs.writeFile(path.join(root, "multi", "CLAUDE.md"), "# x");

  const result = await crawlForProjects({ rootDir: root, maxDepth: 1 });

  assert.equal(result.projects.length, 1);
  const project = result.projects[0];
  assert.equal(project.projectPath, path.join(root, "multi"));
  assert.equal(project.parentPath, root);
  assert.equal(project.depth, 1);
  // Order within markers[] is not specified; just assert membership.
  assert.ok(project.markers.includes(".claude"));
  assert.ok(project.markers.includes("CLAUDE.md"));
});

test("crawlForProjects returns stats with non-zero pathsVisited", async () => {
  const root = await makeTempWorkspace("ankui-crawl-stats-");
  await fs.mkdir(path.join(root, "a", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "b"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 1 });

  assert.ok(result.stats.pathsVisited >= 2, "pathsVisited should count visited dirs");
  assert.ok(typeof result.stats.durationMs === "number");
  assert.ok(result.stats.durationMs >= 0);
});

test("crawlForProjects stops at maxDepth", async () => {
  const root = await makeTempWorkspace("ankui-crawl-depth-");

  // depth 1 child
  await fs.mkdir(path.join(root, "a", ".claude"), { recursive: true });
  // depth 2 grandchild
  await fs.mkdir(path.join(root, "b", "deep", ".claude"), { recursive: true });
  // depth 3 great-grandchild
  await fs.mkdir(path.join(root, "c", "x", "y", ".claude"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 2 });

  const names = result.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(names, ["a", "deep"]);
});

test("crawlForProjects skips directories whose basename is in the skip list", async () => {
  const root = await makeTempWorkspace("ankui-crawl-skip-");

  await fs.mkdir(path.join(root, "node_modules", "pkg", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "Library", "Caches", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "real", ".claude"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 4 });

  const names = result.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(names, ["real"]);
  // Defensive: also assert no `node_modules` or `Library` leaked into the projects list,
  // independent of order.
  assert.equal(result.projects.some((p) => p.projectPath.includes("node_modules")), false);
  assert.equal(result.projects.some((p) => p.projectPath.includes("Library")), false);
});

test("crawlForProjects skips hidden directories that are NOT AI markers", async () => {
  const root = await makeTempWorkspace("ankui-crawl-hidden-");

  // .hidden is not in the marker set → must be skipped.
  await fs.mkdir(path.join(root, ".hidden", "inside", ".claude"), { recursive: true });
  // .dotfiles convention dir — also must be skipped.
  await fs.mkdir(path.join(root, ".dotfiles", ".claude"), { recursive: true });
  await fs.mkdir(path.join(root, "visible", ".claude"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });

  const names = result.projects.map((p) => path.basename(p.projectPath));
  assert.deepEqual(names, ["visible"]);
});

test("crawlForProjects DOES record the parent when a hidden subdir IS a marker", async () => {
  const root = await makeTempWorkspace("ankui-crawl-marker-hidden-");

  await fs.mkdir(path.join(root, "ankui", ".claude", "skills", "x"), { recursive: true });

  const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });

  // Exactly one project: 'ankui'. We must NOT also report 'skills' or anything inside .claude.
  assert.equal(result.projects.length, 1);
  assert.equal(path.basename(result.projects[0].projectPath), "ankui");
});

test("crawlForProjects does not recurse INTO a marker directory", async () => {
  const root = await makeTempWorkspace("ankui-crawl-no-recurse-marker-");

  // Pathological: a .claude/ that itself contains a sub-project with another .claude inside.
  // We should NOT find the inner sub-project because we treat .claude as a leaf.
  await fs.mkdir(
    path.join(root, "outer", ".claude", "inner", ".claude"),
    { recursive: true }
  );

  const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });

  assert.equal(result.projects.length, 1);
  assert.equal(path.basename(result.projects[0].projectPath), "outer");
});

test("crawlForProjects detects symlink loops via fs.realpath + visited set", async () => {
  const root = await makeTempWorkspace("ankui-crawl-loop-");
  // Create a real project inside.
  await fs.mkdir(path.join(root, "real", ".claude"), { recursive: true });
  // Create a symlink loop: root/loop -> root
  await fs.symlink(root, path.join(root, "loop"), "dir");

  const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });

  // The 'real' project must be found exactly once even though the loop would
  // otherwise visit it again via root/loop/real.
  const realCount = result.projects.filter(
    (p) => path.basename(p.projectPath) === "real"
  ).length;
  assert.equal(realCount, 1, `expected 'real' to be discovered once, got ${realCount}`);
});

test("crawlForProjects records a permission_denied warning when a directory is unreadable", async () => {
  const root = await makeTempWorkspace("ankui-crawl-eacces-");
  const unreadable = path.join(root, "locked");
  await fs.mkdir(unreadable);
  await fs.chmod(unreadable, 0o000);

  try {
    const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });
    const warning = result.warnings.find((w) => w.path === unreadable);
    assert.ok(warning, "expected a warning for the unreadable directory");
    assert.equal(warning.reason, "permission_denied");
  } finally {
    await fs.chmod(unreadable, 0o700).catch(() => undefined);
  }
});

test("crawlForProjects continues past unreadable directories", async () => {
  const root = await makeTempWorkspace("ankui-crawl-eacces-continue-");
  await fs.mkdir(path.join(root, "ok", ".claude"), { recursive: true });
  const locked = path.join(root, "locked");
  await fs.mkdir(locked);
  await fs.chmod(locked, 0o000);

  try {
    const result = await crawlForProjects({ rootDir: root, maxDepth: 6 });
    const names = result.projects.map((p) => path.basename(p.projectPath));
    assert.ok(names.includes("ok"), "expected 'ok' project to still be discovered");
  } finally {
    await fs.chmod(locked, 0o700).catch(() => undefined);
  }
});

test("crawlForProjects results are deterministic regardless of concurrency", async () => {
  const root = await makeTempWorkspace("ankui-crawl-parallel-");

  for (const name of ["a", "b", "c", "d", "e"]) {
    await fs.mkdir(path.join(root, name, ".claude"), { recursive: true });
  }
  // Some non-projects mixed in to exercise the queue.
  for (const name of ["x", "y", "z"]) {
    await fs.mkdir(path.join(root, name, "src"), { recursive: true });
  }

  const serial = await crawlForProjects({ rootDir: root, maxDepth: 6, concurrency: 1 });
  const parallel = await crawlForProjects({ rootDir: root, maxDepth: 6, concurrency: 16 });

  const serialNames = serial.projects.map((p) => path.basename(p.projectPath)).sort();
  const parallelNames = parallel.projects.map((p) => path.basename(p.projectPath)).sort();
  assert.deepEqual(serialNames, parallelNames);
  assert.deepEqual(serialNames, ["a", "b", "c", "d", "e"]);
});

test("crawlForProjects with concurrency 1 still produces complete results on a deep tree", async () => {
  const root = await makeTempWorkspace("ankui-crawl-deep-");

  // Depth 5: root / l1 / l2 / l3 / l4 / project-with-.claude
  await fs.mkdir(
    path.join(root, "l1", "l2", "l3", "l4", "deep-project", ".claude"),
    { recursive: true }
  );

  const result = await crawlForProjects({ rootDir: root, maxDepth: 6, concurrency: 1 });
  const names = result.projects.map((p) => path.basename(p.projectPath));
  assert.deepEqual(names, ["deep-project"]);
});
