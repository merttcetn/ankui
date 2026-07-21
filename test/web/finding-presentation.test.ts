import assert from "node:assert/strict";
import test from "node:test";

import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  type Finding,
  type MultiProjectScanResult,
  type ScanResult
} from "../../src/types.js";
import {
  buildFindingPresentation,
  findingFingerprint,
  findingPresentationTotals
} from "../../src/web-ui/presentation/findings.js";

function emptyScan(cwd: string, findings: Finding[] = []): ScanResult {
  const tools = createAllEmptyTools();
  return {
    scannedAt: "2026-07-21T10:00:00.000Z",
    cwd,
    homeDir: "/Users/alice",
    tools,
    findings,
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return createFinding({
    toolIds: ["gemini"],
    title: "Broad automation access",
    message: "The server can automate browser and filesystem operations.",
    category: "broad_access_capability",
    severity: "high",
    accessLevel: "broad",
    scope: "project",
    sourcePaths: ["/Users/alice/Developer/one/.gemini/settings.json"],
    relatedSkillIds: [],
    recommendation: "Confirm that this access is intentional.",
    ...overrides
  });
}

function multi(userFindings: Finding[], projectFindings: Finding[]): MultiProjectScanResult {
  return {
    scannedAt: "2026-07-21T10:00:00.000Z",
    cwd: "/Users/alice",
    homeDir: "/Users/alice",
    devRoots: ["/Users/alice/Developer"],
    userScope: emptyScan("/Users/alice", userFindings),
    projects: [{
      projectPath: "/Users/alice/Developer/one",
      displayPath: "~/Developer/one",
      scan: emptyScan("/Users/alice/Developer/one", projectFindings)
    }],
    warnings: [],
    totals: { projectCount: 1, skillsAcrossProjects: 0, userScopeSkills: 0 }
  };
}

test("buildFindingPresentation groups repeated findings while retaining occurrence context", () => {
  const user = finding({ scope: "user", sourcePaths: ["/Users/alice/.gemini/settings.json"] });
  const project = finding();
  const sections = buildFindingPresentation(multi([user], [project]));

  assert.equal(sections.length, 1);
  assert.equal(sections[0].groups.length, 1);
  assert.equal(sections[0].occurrenceCount, 2);
  assert.deepEqual(
    sections[0].groups[0].occurrences.map((occurrence) => occurrence.context),
    ["User scope", "~/Developer/one"]
  );
  assert.deepEqual(sections[0].groups[0].scopes, ["user", "project"]);
  assert.deepEqual(findingPresentationTotals(sections), { unique: 1, occurrences: 2 });
});

test("presentation fingerprint keeps meaningfully different messages separate", () => {
  const first = finding();
  const second = finding({ message: "A different explanation of the access surface." });
  const sections = buildFindingPresentation(multi([], [first, second]));

  assert.notEqual(findingFingerprint(first), findingFingerprint(second));
  assert.equal(sections[0].groups.length, 2);
  assert.deepEqual(findingPresentationTotals(sections), { unique: 2, occurrences: 2 });
});
