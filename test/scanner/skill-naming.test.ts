import assert from "node:assert/strict";
import test from "node:test";

import { canonicalMcpName } from "../../src/scanner/skill-naming.js";

test("canonicalMcpName recognizes common MCP IDs across spellings", () => {
  for (const raw of ["github", "GitHub", "github-mcp", "GITHUB_MCP", "octocat"]) {
    const result = canonicalMcpName(raw);
    assert.equal(result.mcpId, "github", `raw=${raw}`);
    assert.equal(result.canonical, "GitHub", `raw=${raw}`);
  }
});

test("canonicalMcpName recognizes postgres aliases", () => {
  for (const raw of ["postgres", "postgresql", "pg", "postgres-mcp"]) {
    assert.equal(canonicalMcpName(raw).mcpId, "postgres", `raw=${raw}`);
  }
});

test("canonicalMcpName falls back to raw name for unknown MCPs", () => {
  const result = canonicalMcpName("my-internal-mcp");
  assert.equal(result.mcpId, undefined);
  assert.equal(result.canonical, "my-internal-mcp");
});

test("canonicalMcpName handles the real-machine MCPs (shadcn, context7, reddit)", () => {
  assert.equal(canonicalMcpName("shadcn").mcpId, "shadcn");
  assert.equal(canonicalMcpName("context7").mcpId, "context7");
  assert.equal(canonicalMcpName("reddit").mcpId, "reddit");
});

test("canonicalMcpName handles Antigravity plugin MCPs", () => {
  const swarm = canonicalMcpName("gemini-swarm");
  assert.equal(swarm.mcpId, "gemini-swarm");
  assert.equal(swarm.canonical, "Gemini Swarm");

  const stitch = canonicalMcpName("stitch");
  assert.equal(stitch.mcpId, "stitch");
  assert.equal(stitch.canonical, "Stitch");
});

test("canonicalMcpName handles Expo MCP across spellings", () => {
  for (const raw of ["expo", "expo-mcp", "Expo"]) {
    const result = canonicalMcpName(raw);
    assert.equal(result.mcpId, "expo", `raw=${raw}`);
    assert.equal(result.canonical, "Expo", `raw=${raw}`);
  }
});
