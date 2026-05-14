import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateFindings,
  FINDING_CATEGORY_ORDER
} from "../../../src/tui/util/finding-grouping.js";
import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  type Finding,
  type MultiProjectScanResult,
  type ScanResult
} from "../../../src/types.js";

function emptyScanResult(): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function f(
  category: Finding["category"],
  title: string,
  scope: Finding["scope"] = "user"
): Finding {
  return createFinding({
    toolIds: ["claude"],
    title,
    message: "",
    category,
    accessLevel: "moderate",
    scope,
    sourcePaths: ["/x"],
    relatedSkillIds: [],
    recommendation: ""
  });
}

function resultWith(findings: {
  user?: Finding[];
  perProject?: Finding[][];
}): MultiProjectScanResult {
  const userScope = emptyScanResult();
  userScope.findings = findings.user ?? [];
  const projects = (findings.perProject ?? []).map((list, idx) => {
    const scan = emptyScanResult();
    scan.findings = list;
    return { projectPath: `/p/${idx}`, displayPath: `p${idx}`, scan };
  });
  return {
    scannedAt: "2026-05-14T00:00:00.000Z",
    cwd: "/cwd",
    homeDir: "/home",
    devRoots: [],
    userScope,
    projects,
    warnings: [],
    totals: { projectCount: projects.length, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("aggregateFindings returns empty array when no findings exist", () => {
  assert.deepEqual(aggregateFindings(resultWith({})), []);
});

test("aggregateFindings merges user-scope and per-project findings into one section list", () => {
  const sections = aggregateFindings(
    resultWith({
      user: [f("duplicate_mcp", "user-dup")],
      perProject: [[f("duplicate_mcp", "project-dup", "project")]]
    })
  );
  // One section (duplicate_mcp) with two findings.
  assert.equal(sections.length, 1);
  assert.equal(sections[0].findings.length, 2);
  assert.deepEqual(
    sections[0].findings.map((x) => x.title).sort(),
    ["project-dup", "user-dup"]
  );
});

test("aggregateFindings emits sections in priority order", () => {
  const sections = aggregateFindings(
    resultWith({
      user: [
        f("dangerous_pattern", "danger"),
        f("broad_access_capability", "broad"),
        f("secret_reference", "secret")
      ]
    })
  );
  const order = sections.map((s) => s.category);
  // broad_access_capability before secret_reference before dangerous_pattern
  assert.deepEqual(order, ["broad_access_capability", "secret_reference", "dangerous_pattern"]);
});

test("aggregateFindings omits sections that have zero findings", () => {
  const sections = aggregateFindings(
    resultWith({ user: [f("duplicate_mcp", "x")] })
  );
  assert.deepEqual(sections.map((s) => s.category), ["duplicate_mcp"]);
});

test("aggregateFindings sorts findings within a section by title (case-insensitive)", () => {
  const sections = aggregateFindings(
    resultWith({
      user: [
        f("duplicate_mcp", "zulu"),
        f("duplicate_mcp", "alpha"),
        f("duplicate_mcp", "Mike")
      ]
    })
  );
  assert.deepEqual(
    sections[0].findings.map((x) => x.title),
    ["alpha", "Mike", "zulu"]
  );
});

test("FINDING_CATEGORY_ORDER starts with broad_access_capability and ends with dangerous_pattern", () => {
  assert.equal(FINDING_CATEGORY_ORDER[0].category, "broad_access_capability");
  assert.equal(
    FINDING_CATEGORY_ORDER[FINDING_CATEGORY_ORDER.length - 1].category,
    "dangerous_pattern"
  );
});
