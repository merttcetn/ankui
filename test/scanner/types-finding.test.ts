import assert from "node:assert/strict";
import test from "node:test";

import { createFinding } from "../../src/types.js";

test("createFinding assigns a normalized id derived from category/title/tools", () => {
  const finding = createFinding({
    toolIds: ["claude"],
    title: "Postgres MCP has broad database access",
    message: "Configured Postgres MCP server can read or write any data in the database.",
    category: "broad_access_capability",
    accessLevel: "broad",
    scope: "user",
    sourcePaths: ["/home/x/.claude/settings.json"],
    relatedSkillIds: ["claude:mcp_server:postgres:..."],
    recommendation: "Review the Postgres MCP scope; consider least-privilege credentials."
  });

  assert.equal(finding.category, "broad_access_capability");
  assert.equal(finding.accessLevel, "broad");
  assert.equal(finding.scope, "user");
  assert.equal(typeof finding.id, "string");
  assert.match(finding.id, /^finding-broad_access_capability-/);
});

test("createFinding accepts an explicit id override", () => {
  const finding = createFinding({
    id: "custom-id-1",
    toolIds: ["codex"],
    title: "T",
    message: "M",
    category: "unknown_capability",
    accessLevel: "unknown",
    scope: "project",
    sourcePaths: [],
    relatedSkillIds: [],
    recommendation: "R"
  });

  assert.equal(finding.id, "custom-id-1");
});
