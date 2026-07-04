import assert from "node:assert/strict";
import test from "node:test";

import {
  createFinding,
  defaultFindingSeverity,
  type FindingCategory
} from "../../src/types.js";

const EXPECTED_DEFAULTS: Record<FindingCategory, "high" | "medium" | "low"> = {
  broad_access_capability: "high",
  dangerous_pattern: "high",
  secret_reference: "medium",
  unknown_capability: "medium",
  skipped_sensitive_file: "medium",
  parse_issue: "medium",
  duplicate_mcp: "low"
};

test("defaultFindingSeverity maps every finding category to the MVP severity scale", () => {
  for (const [category, severity] of Object.entries(EXPECTED_DEFAULTS)) {
    assert.equal(defaultFindingSeverity(category as FindingCategory), severity);
  }
});

test("createFinding assigns default severity and preserves explicit severity", () => {
  const defaulted = createFinding({
    toolIds: ["claude"],
    title: "duplicate",
    message: "m",
    category: "duplicate_mcp",
    accessLevel: "moderate",
    scope: "cross_tool",
    sourcePaths: ["/x"],
    relatedSkillIds: [],
    recommendation: "r"
  });
  assert.equal(defaulted.severity, "low");

  const explicit = createFinding({
    toolIds: ["claude"],
    title: "duplicate",
    message: "m",
    category: "duplicate_mcp",
    severity: "high",
    accessLevel: "moderate",
    scope: "cross_tool",
    sourcePaths: ["/x"],
    relatedSkillIds: [],
    recommendation: "r"
  });
  assert.equal(explicit.severity, "high");
});
