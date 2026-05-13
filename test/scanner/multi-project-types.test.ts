import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiProjectTotals,
  type MultiProjectScanResult,
  type ProjectScan
} from "../../src/types.js";

test("createMultiProjectTotals sums skill counts across user scope and projects", () => {
  const totals = createMultiProjectTotals({
    userScopeSkillCount: 273,
    projectSkillCounts: [5, 12, 3, 8]
  });

  assert.equal(totals.projectCount, 4);
  assert.equal(totals.skillsAcrossProjects, 28);
  assert.equal(totals.userScopeSkills, 273);
});

test("createMultiProjectTotals handles an empty project list", () => {
  const totals = createMultiProjectTotals({
    userScopeSkillCount: 0,
    projectSkillCounts: []
  });

  assert.equal(totals.projectCount, 0);
  assert.equal(totals.skillsAcrossProjects, 0);
  assert.equal(totals.userScopeSkills, 0);
});

test("MultiProjectScanResult shape compiles with expected fields", () => {
  // Structural smoke test — pure compile-time check expressed at runtime
  // by constructing a literal that satisfies the type.
  const example: MultiProjectScanResult = {
    scannedAt: "2026-05-13T00:00:00.000Z",
    cwd: "/tmp",
    homeDir: "/Users/x",
    devRoots: ["/Users/x/Developer"],
    userScope: {
      scannedAt: "2026-05-13T00:00:00.000Z",
      cwd: "/Users/x",
      homeDir: "/Users/x",
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
    },
    projects: [],
    warnings: [],
    totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };

  assert.equal(example.devRoots.length, 1);

  const project: ProjectScan = {
    projectPath: "/Users/x/Developer/ankui",
    displayPath: "~/Developer/ankui",
    scan: example.userScope
  };
  assert.equal(project.projectPath, "/Users/x/Developer/ankui");
});
