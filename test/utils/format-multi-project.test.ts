import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMultiProjectJson,
  formatMultiProjectSummary
} from "../../src/utils/format-multi-project.js";
import {
  createAllEmptyTools,
  createScanSummary,
  createWarning,
  type MultiProjectScanResult,
  type ScanResult
} from "../../src/types.js";

function emptyScan(cwd: string, homeDir: string): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd,
    homeDir,
    tools,
    findings: [],
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function emptyMulti(): MultiProjectScanResult {
  return {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd: "/Users/x",
    homeDir: "/Users/x",
    devRoots: [],
    userScope: emptyScan("/Users/x", "/Users/x"),
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("formatMultiProjectSummary header reports projects, dev roots, and user-scope skills", () => {
  const result = emptyMulti();
  const output = formatMultiProjectSummary(result);
  assert.match(
    output.split("\n")[0],
    /^Ankui Multi-project Scan$/
  );
  assert.match(output, /Projects           0 projects/);
  assert.match(output, /Dev roots          0/);
  assert.match(output, /User-scope skills  0/);
});

test("formatMultiProjectSummary shows empty-dev-root message when no devRoots registered", () => {
  const output = formatMultiProjectSummary(emptyMulti());
  assert.match(output, /No dev roots registered\./);
});

test("formatMultiProjectSummary renders Projects (N) block with displayPath, skill, and finding counts", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  result.projects = [
    {
      projectPath: "/Users/x/Developer/ankui",
      displayPath: "~/Developer/ankui",
      scan: emptyScan("/Users/x/Developer/ankui", "/Users/x")
    }
  ];
  result.totals = { projectCount: 1, skillsAcrossProjects: 0, userScopeSkills: 0 };

  const output = formatMultiProjectSummary(result);

  assert.match(output, /\nProjects \(1\)\n─/);
  assert.match(output, /~\/Developer\/ankui/);
  assert.match(output, /0 skills · 0 findings/);
});

test("formatMultiProjectSummary sorts projects alphabetically by displayPath", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  result.projects = [
    {
      projectPath: "/Users/x/Developer/zeta",
      displayPath: "~/Developer/zeta",
      scan: emptyScan("/zeta", "/Users/x")
    },
    {
      projectPath: "/Users/x/Developer/alpha",
      displayPath: "~/Developer/alpha",
      scan: emptyScan("/alpha", "/Users/x")
    },
    {
      projectPath: "/Users/x/Developer/middle",
      displayPath: "~/Developer/middle",
      scan: emptyScan("/middle", "/Users/x")
    }
  ];

  const output = formatMultiProjectSummary(result);
  const idxAlpha = output.indexOf("~/Developer/alpha");
  const idxMiddle = output.indexOf("~/Developer/middle");
  const idxZeta = output.indexOf("~/Developer/zeta");
  assert.ok(
    idxAlpha < idxMiddle && idxMiddle < idxZeta,
    "projects must sort alphabetically by displayPath"
  );
});

test("formatMultiProjectSummary ends with 'No warnings.' on clean run", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  const output = formatMultiProjectSummary(result);
  assert.match(output, /\nNo warnings\.\s*$/);
});

test("formatMultiProjectSummary renders warnings grouped by reason", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  result.warnings = [
    createWarning({
      reason: "adapter_timeout",
      path: "/Users/x/Developer/slow-proj",
      message: "Project scan timed out after 5000ms"
    }),
    createWarning({
      reason: "permission_denied",
      path: "/Users/x/Developer/orphan",
      message: "Cannot read dev root /Users/x/Developer/orphan: ENOENT"
    })
  ];
  const output = formatMultiProjectSummary(result);

  assert.match(output, /Warnings \(2\)/);
  assert.match(output, /adapter_timeout \(1\)\n  • ~\/Developer\/slow-proj/);
  assert.match(output, /permission_denied \(1\)/);
});

test("formatMultiProjectJson exposes devRoots, totals, and per-project payload", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  result.projects = [
    {
      projectPath: "/Users/x/Developer/ankui",
      displayPath: "~/Developer/ankui",
      scan: emptyScan("/Users/x/Developer/ankui", "/Users/x")
    }
  ];
  result.totals = { projectCount: 1, skillsAcrossProjects: 0, userScopeSkills: 0 };

  const json = JSON.parse(formatMultiProjectJson(result));

  assert.equal(json.scannedAt, "2026-05-13T00:00:00.000Z");
  assert.deepEqual(json.devRoots, ["/Users/x/Developer"]);
  assert.equal(json.userScope.tools.length, 7);
  assert.equal(json.projects.length, 1);
  assert.equal(json.projects[0].projectPath, "/Users/x/Developer/ankui");
  assert.equal(json.projects[0].displayPath, "~/Developer/ankui");
  assert.equal(json.totals.projectCount, 1);
  assert.equal(json.totals.skillsAcrossProjects, 0);
});

test("formatMultiProjectJson includes warnings array even when empty", () => {
  const json = JSON.parse(formatMultiProjectJson(emptyMulti()));
  assert.deepEqual(json.warnings, []);
});

test("formatMultiProjectSummary plural — one project, one dev root, one user-scope skill", () => {
  const result = emptyMulti();
  result.devRoots = ["/Users/x/Developer"];
  result.projects = [
    {
      projectPath: "/Users/x/Developer/ankui",
      displayPath: "~/Developer/ankui",
      scan: emptyScan("/ankui", "/Users/x")
    }
  ];
  result.totals = { projectCount: 1, skillsAcrossProjects: 0, userScopeSkills: 1 };

  const output = formatMultiProjectSummary(result);
  assert.match(
    output.split("\n")[0],
    /^Ankui Multi-project Scan$/
  );
  assert.match(output, /Projects           1 project/);
  assert.match(output, /Dev roots          1/);
  assert.match(output, /User-scope skills  1/);
});
