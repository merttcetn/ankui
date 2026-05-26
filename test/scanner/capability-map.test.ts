import assert from "node:assert/strict";
import test from "node:test";

import { mapMcpById, mapOpenCodeToolKey } from "../../src/scanner/capability-map.js";

test("mapMcpById classifies known database servers as broad database access", () => {
  for (const id of ["postgres", "mysql", "sqlite"]) {
    const result = mapMcpById(id);
    assert.deepEqual(result.capabilityCategories, ["database"]);
    assert.equal(result.accessLevel, "broad");
  }
});

test("mapMcpById classifies github/gitlab as moderate code_hosting", () => {
  for (const id of ["github", "gitlab"]) {
    const result = mapMcpById(id);
    assert.deepEqual(result.capabilityCategories, ["code_hosting"]);
    assert.equal(result.accessLevel, "moderate");
  }
});

test("mapMcpById classifies shell/filesystem as broad", () => {
  assert.deepEqual(mapMcpById("shell").capabilityCategories, ["shell"]);
  assert.equal(mapMcpById("shell").accessLevel, "broad");
  assert.deepEqual(mapMcpById("filesystem").capabilityCategories, ["filesystem"]);
  assert.equal(mapMcpById("filesystem").accessLevel, "broad");
});

test("mapMcpById marks the real-machine MCPs (shadcn/context7/reddit) conservatively", () => {
  assert.deepEqual(mapMcpById("shadcn").capabilityCategories, ["network"]);
  assert.equal(mapMcpById("shadcn").accessLevel, "limited");
  assert.deepEqual(mapMcpById("context7").capabilityCategories, ["network"]);
  assert.equal(mapMcpById("context7").accessLevel, "limited");
  assert.deepEqual(mapMcpById("reddit").capabilityCategories, ["communication"]);
  assert.equal(mapMcpById("reddit").accessLevel, "moderate");
});

test("mapMcpById classifies Antigravity plugin MCPs conservatively", () => {
  assert.deepEqual(mapMcpById("gemini-swarm").capabilityCategories, ["automation"]);
  assert.equal(mapMcpById("gemini-swarm").accessLevel, "broad");
  assert.deepEqual(mapMcpById("stitch").capabilityCategories, ["network", "automation"]);
  assert.equal(mapMcpById("stitch").accessLevel, "moderate");
});

test("mapMcpById classifies Expo MCP as network + automation", () => {
  assert.deepEqual(mapMcpById("expo").capabilityCategories, ["network", "automation"]);
  assert.equal(mapMcpById("expo").accessLevel, "moderate");
});

test("mapMcpById returns unknown/unknown when the id is not in the catalog", () => {
  const result = mapMcpById("totally-unknown-server");
  assert.deepEqual(result.capabilityCategories, ["unknown"]);
  assert.equal(result.accessLevel, "unknown");
});

test("mapMcpById returns unknown/unknown when called with undefined", () => {
  const result = mapMcpById(undefined);
  assert.deepEqual(result.capabilityCategories, ["unknown"]);
  assert.equal(result.accessLevel, "unknown");
});

test("mapOpenCodeToolKey treats bash as broad shell access", () => {
  const result = mapOpenCodeToolKey("bash");
  assert.deepEqual(result.capabilityCategories, ["shell"]);
  assert.equal(result.accessLevel, "broad");
});

test("mapOpenCodeToolKey separates read (moderate) from write/edit (broad)", () => {
  assert.equal(mapOpenCodeToolKey("read").accessLevel, "moderate");
  assert.deepEqual(mapOpenCodeToolKey("read").capabilityCategories, ["filesystem"]);
  assert.equal(mapOpenCodeToolKey("write").accessLevel, "broad");
  assert.equal(mapOpenCodeToolKey("edit").accessLevel, "broad");
});

test("mapOpenCodeToolKey classifies webfetch as moderate network access", () => {
  const result = mapOpenCodeToolKey("webfetch");
  assert.deepEqual(result.capabilityCategories, ["network"]);
  assert.equal(result.accessLevel, "moderate");
});

test("mapOpenCodeToolKey returns unknown for unrecognized keys", () => {
  const result = mapOpenCodeToolKey("my-custom-tool");
  assert.deepEqual(result.capabilityCategories, ["unknown"]);
  assert.equal(result.accessLevel, "unknown");
});

import { canonicalMcpName } from "../../src/scanner/skill-naming.js";
import { enrichSkill } from "../../src/scanner/capability-map.js";
import { createSkillId, type Skill } from "../../src/types.js";

function makeSkill(partial: Partial<Skill> & Pick<Skill, "toolId" | "kind" | "name">): Skill {
  const sourcePath = partial.sourcePath ?? `/tmp/${partial.name}`;
  return {
    id: createSkillId({
      toolId: partial.toolId,
      kind: partial.kind,
      name: partial.name,
      sourcePath
    }),
    toolId: partial.toolId,
    kind: partial.kind,
    name: partial.name,
    summary: partial.summary ?? "",
    scope: partial.scope ?? "user",
    sourcePath,
    source: partial.source ?? "config",
    capabilityCategories: partial.capabilityCategories ?? ["unknown"],
    accessLevel: partial.accessLevel ?? "unknown",
    details: partial.details
  };
}

test("enrichSkill upgrades a known MCP server skill", () => {
  const skill = makeSkill({ toolId: "claude", kind: "mcp_server", name: "postgres" });
  enrichSkill(skill);
  assert.deepEqual(skill.capabilityCategories, ["database"]);
  assert.equal(skill.accessLevel, "broad");
});

test("enrichSkill keeps an unknown MCP server marked unknown", () => {
  const skill = makeSkill({ toolId: "claude", kind: "mcp_server", name: "internal-mystery" });
  enrichSkill(skill);
  assert.deepEqual(skill.capabilityCategories, ["unknown"]);
  assert.equal(skill.accessLevel, "unknown");
});

test("enrichSkill replaces the name with the canonical display name when matched", () => {
  const skill = makeSkill({ toolId: "claude", kind: "mcp_server", name: "github-mcp" });
  enrichSkill(skill);
  assert.equal(skill.name, "GitHub");
});

test("enrichSkill leaves the raw name when the MCP is unknown", () => {
  const skill = makeSkill({ toolId: "claude", kind: "mcp_server", name: "internal-mystery" });
  enrichSkill(skill);
  assert.equal(skill.name, "internal-mystery");
});

test("enrichSkill leaves non-MCP skills untouched", () => {
  const skill = makeSkill({ toolId: "claude", kind: "agent_skill", name: "deploy" });
  enrichSkill(skill);
  assert.deepEqual(skill.capabilityCategories, ["unknown"]);
  assert.equal(skill.accessLevel, "unknown");
  assert.equal(skill.name, "deploy");
});

test("canonicalMcpName reference (smoke)", () => {
  assert.equal(canonicalMcpName("github").mcpId, "github");
});
