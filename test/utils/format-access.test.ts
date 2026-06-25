import assert from "node:assert/strict";
import test from "node:test";

import { formatAccessReview } from "../../src/utils/format-access.js";
import { stripAnsi } from "../../src/utils/format-ui.js";
import { createScanSummary, createAllEmptyTools, type ScanResult } from "../../src/types.js";

function emptyResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd: "/tmp/cwd",
    homeDir: "/tmp/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

test("formatAccessReview returns a 'no findings' message when findings is empty", () => {
  const output = formatAccessReview(emptyResult());
  assert.match(output, /^Ankui Access Review\n/);
  assert.match(output, /✓ No findings\.\s*$/);
});

import { createFinding } from "../../src/types.js";

test("formatAccessReview renders a single duplicate_mcp finding with header and section", () => {
  const result: ScanResult = {
    ...emptyResult(),
    findings: [
      createFinding({
        toolIds: ["codex", "cursor"],
        title: "shadcn MCP is configured in 2 tools",
        message: "Duplicated across tools.",
        category: "duplicate_mcp",
        accessLevel: "limited",
        scope: "cross_tool",
        sourcePaths: ["/elsewhere/.codex/config.toml", "/elsewhere/.cursor/mcp.json"],
        relatedSkillIds: ["a", "b"],
        recommendation: "Verify each instance uses an appropriately scoped credential."
      })
    ]
  };

  const output = formatAccessReview(result);

  assert.match(output, /^Ankui Access Review\n/);
  assert.match(output, /Findings\s+1/);
  assert.match(output, /Mix\s+1 duplicate_mcp/);
  assert.match(output, /Duplicate MCP servers \(1\)/);
  assert.match(output, /shadcn MCP is configured in 2 tools/);
  assert.match(output, /Scope\s+cross_tool/);
  assert.match(output, /Tools\s+codex, cursor/);
  assert.match(output, /\/elsewhere\/\.codex\/config\.toml/);
  assert.match(output, /\/elsewhere\/\.cursor\/mcp\.json/);
  assert.match(output, /Recommendation Verify each instance/);
});

test("formatAccessReview rewrites homeDir prefixes as ~", () => {
  const result: ScanResult = {
    ...emptyResult(),
    homeDir: "/Users/test",
    findings: [
      createFinding({
        toolIds: ["claude"],
        title: "careful contains review-worthy command patterns",
        message: "rm -rf",
        category: "dangerous_pattern",
        accessLevel: "moderate",
        scope: "user",
        sourcePaths: ["/Users/test/.claude/skills/careful/SKILL.md"],
        relatedSkillIds: ["x"],
        recommendation: "Review it."
      })
    ]
  };

  const output = formatAccessReview(result);
  assert.match(output, /~\/\.claude\/skills\/careful\/SKILL\.md/);
  assert.doesNotMatch(output, /\/Users\/test\/\.claude/);
});

test("formatAccessReview leaves paths outside homeDir absolute", () => {
  const result: ScanResult = {
    ...emptyResult(),
    homeDir: "/Users/test",
    findings: [
      createFinding({
        toolIds: ["claude"],
        title: "Z",
        message: "M",
        category: "dangerous_pattern",
        accessLevel: "moderate",
        scope: "project",
        sourcePaths: ["/etc/somewhere/else.md"],
        relatedSkillIds: ["x"],
        recommendation: "R"
      })
    ]
  };

  const output = formatAccessReview(result);
  assert.match(output, /\/etc\/somewhere\/else\.md/);
  assert.doesNotMatch(output, /~\/etc/);
});

import { type Finding } from "../../src/types.js";

function mkFinding(category: Finding["category"], title: string): Finding {
  return createFinding({
    toolIds: ["claude"],
    title,
    message: "m",
    category,
    accessLevel: category === "dangerous_pattern" ? "moderate" : "broad",
    scope: "user",
    sourcePaths: ["/Users/test/x"],
    relatedSkillIds: ["s"],
    recommendation: "r"
  });
}

test("formatAccessReview orders sections: broad > duplicate > secret > unknown > dangerous", () => {
  const result: ScanResult = {
    ...emptyResult(),
    homeDir: "/Users/test",
    findings: [
      mkFinding("dangerous_pattern", "a-dangerous"),
      mkFinding("unknown_capability", "b-unknown"),
      mkFinding("secret_reference", "c-secret"),
      mkFinding("duplicate_mcp", "d-duplicate"),
      mkFinding("broad_access_capability", "e-broad")
    ]
  };

  const output = formatAccessReview(result);

  const sectionOrder = [
    "Broad-access MCP servers",
    "Duplicate MCP servers",
    "Secret-bearing env keys",
    "Uncatalogued MCP servers",
    "Review-worthy command patterns"
  ];

  const indices = sectionOrder.map((heading) => output.indexOf(heading));
  for (const idx of indices) {
    assert.notEqual(idx, -1, `expected to find: ${sectionOrder[indices.indexOf(idx)]}`);
  }
  const sorted = [...indices].sort((a, b) => a - b);
  assert.deepEqual(indices, sorted, "sections must appear in priority order");
});

test("formatAccessReview sorts findings within a section alphabetically by title", () => {
  const result: ScanResult = {
    ...emptyResult(),
    homeDir: "/Users/test",
    findings: [
      mkFinding("dangerous_pattern", "zebra"),
      mkFinding("dangerous_pattern", "apple"),
      mkFinding("dangerous_pattern", "mango")
    ]
  };

  const output = formatAccessReview(result);
  const appleIdx = output.indexOf("apple");
  const mangoIdx = output.indexOf("mango");
  const zebraIdx = output.indexOf("zebra");
  assert.ok(appleIdx < mangoIdx && mangoIdx < zebraIdx, "expected alphabetical title order");
});

test("formatAccessReview header lists categories in descending count order", () => {
  const result: ScanResult = {
    ...emptyResult(),
    homeDir: "/Users/test",
    findings: [
      mkFinding("dangerous_pattern", "a1"),
      mkFinding("dangerous_pattern", "a2"),
      mkFinding("dangerous_pattern", "a3"),
      mkFinding("secret_reference", "b1"),
      mkFinding("duplicate_mcp", "c1"),
      mkFinding("duplicate_mcp", "c2")
    ]
  };

  const output = formatAccessReview(result);
  assert.match(output, /Findings\s+6/);
  assert.match(output, /Mix\s+3 dangerous_pattern · 2 duplicate_mcp · 1 secret_reference/);
});

test("formatAccessReview can render ANSI color and strip back to the plain contract", () => {
  const result: ScanResult = {
    ...emptyResult(),
    findings: [mkFinding("broad_access_capability", "broad thing")]
  };

  const colored = formatAccessReview(result, { color: true });

  assert.match(colored, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(colored), /^Ankui Access Review\n/);
  assert.match(stripAnsi(colored), /Findings\s+1/);
});

import { formatAccessReviewJson } from "../../src/utils/format-access.js";

test("formatAccessReviewJson returns metadata + findings + grouped summary", () => {
  const result: ScanResult = {
    ...emptyResult(),
    scannedAt: "2026-05-13T12:00:00.000Z",
    cwd: "/p",
    homeDir: "/h",
    findings: [
      mkFinding("duplicate_mcp", "a"),
      mkFinding("duplicate_mcp", "b"),
      mkFinding("dangerous_pattern", "c")
    ]
  };

  const json = JSON.parse(formatAccessReviewJson(result));

  assert.equal(json.scannedAt, "2026-05-13T12:00:00.000Z");
  assert.equal(json.cwd, "/p");
  assert.equal(json.homeDir, "/h");
  assert.equal(json.findings.length, 3);
  assert.equal(json.summary.totalFindings, 3);
  assert.equal(json.summary.byCategory.duplicate_mcp, 2);
  assert.equal(json.summary.byCategory.dangerous_pattern, 1);
  assert.equal(json.summary.byCategory.broad_access_capability, 0);
  assert.equal(json.summary.byCategory.secret_reference, 0);
  assert.equal(json.summary.byCategory.unknown_capability, 0);
  assert.equal(json.summary.byScope.user, 3);
  assert.equal(json.summary.byScope.project, 0);
  assert.equal(json.summary.byScope.cross_tool, 0);
});

test("formatAccessReviewJson returns zero-everywhere shape on empty findings", () => {
  const json = JSON.parse(formatAccessReviewJson(emptyResult()));
  assert.equal(json.findings.length, 0);
  assert.equal(json.summary.totalFindings, 0);
  for (const cat of [
    "broad_access_capability",
    "duplicate_mcp",
    "secret_reference",
    "unknown_capability",
    "dangerous_pattern"
  ] as const) {
    assert.equal(json.summary.byCategory[cat], 0);
  }
});
