import assert from "node:assert/strict";
import test from "node:test";

import { reviewTools } from "../../src/scanner/access-review.js";
import { createEmptyTool, createSkillId, type AITool, type Skill } from "../../src/types.js";

function makeTool(id: AITool["id"], skills: Skill[] = []): AITool {
  const tool = createEmptyTool(id);
  tool.detected = true;
  tool.skills = skills;
  return tool;
}

function makeMcpSkill(input: {
  toolId: AITool["id"];
  name: string;
  scope?: Skill["scope"];
  accessLevel: Skill["accessLevel"];
  capabilityCategories: Skill["capabilityCategories"];
  sourcePath?: string;
  details?: Skill["details"];
}): Skill {
  const sourcePath = input.sourcePath ?? `/tmp/${input.name}`;
  return {
    id: createSkillId({ toolId: input.toolId, kind: "mcp_server", name: input.name, sourcePath }),
    toolId: input.toolId,
    kind: "mcp_server",
    name: input.name,
    summary: `${input.name} MCP server.`,
    scope: input.scope ?? "user",
    sourcePath,
    source: "config",
    capabilityCategories: input.capabilityCategories,
    accessLevel: input.accessLevel,
    details: input.details
  };
}

test("reviewTools emits a broad_access_capability finding for broad-access MCPs", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "Postgres",
        accessLevel: "broad",
        capabilityCategories: ["database"]
      })
    ])
  ];

  const findings = reviewTools(tools);

  const broad = findings.filter((f) => f.category === "broad_access_capability");
  assert.equal(broad.length, 1);
  assert.equal(broad[0].accessLevel, "broad");
  assert.deepEqual(broad[0].toolIds, ["claude"]);
  assert.equal(broad[0].scope, "user");
  assert.ok(broad[0].relatedSkillIds.length === 1);
  assert.match(broad[0].title, /Postgres/);
});

test("reviewTools does not emit broad-access findings for moderate or limited skills", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"]
      }),
      makeMcpSkill({
        toolId: "claude",
        name: "Context7",
        accessLevel: "limited",
        capabilityCategories: ["network"]
      })
    ])
  ];

  const findings = reviewTools(tools);

  assert.equal(findings.filter((f) => f.category === "broad_access_capability").length, 0);
});

test("reviewTools emits an unknown_capability finding for unrecognized MCP servers", () => {
  const tools = [
    makeTool("codex", [
      makeMcpSkill({
        toolId: "codex",
        name: "internal-mystery",
        accessLevel: "unknown",
        capabilityCategories: ["unknown"]
      })
    ])
  ];

  const findings = reviewTools(tools);
  const unknown = findings.filter((f) => f.category === "unknown_capability");
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].accessLevel, "unknown");
  assert.deepEqual(unknown[0].toolIds, ["codex"]);
  assert.match(unknown[0].title, /internal-mystery/);
});

test("reviewTools does not emit unknown_capability findings for known MCPs", () => {
  const tools = [
    makeTool("codex", [
      makeMcpSkill({
        toolId: "codex",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"]
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(findings.filter((f) => f.category === "unknown_capability").length, 0);
});

test("reviewTools emits a duplicate_mcp finding when the same MCP appears in multiple tools", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"],
        sourcePath: "/home/.claude/.mcp.json"
      })
    ]),
    makeTool("codex", [
      makeMcpSkill({
        toolId: "codex",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"],
        sourcePath: "/home/.codex/config.toml"
      })
    ])
  ];

  const findings = reviewTools(tools);
  const dupes = findings.filter((f) => f.category === "duplicate_mcp");

  assert.equal(dupes.length, 1, "expected exactly one duplicate finding for GitHub");
  assert.equal(dupes[0].scope, "cross_tool");
  assert.deepEqual(dupes[0].toolIds.sort(), ["claude", "codex"]);
  assert.equal(dupes[0].sourcePaths.length, 2);
});

test("reviewTools does not emit duplicate_mcp when an MCP appears in just one tool", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"]
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(findings.filter((f) => f.category === "duplicate_mcp").length, 0);
});

test("reviewTools emits a secret_reference finding when MCP env keys look secret-like", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"],
        details: { envKeys: ["GITHUB_TOKEN", "DEBUG"] }
      })
    ])
  ];

  const findings = reviewTools(tools);
  const secrets = findings.filter((f) => f.category === "secret_reference");

  assert.equal(secrets.length, 1);
  assert.deepEqual(secrets[0].toolIds, ["claude"]);
  assert.match(secrets[0].message, /GITHUB_TOKEN/);
  assert.doesNotMatch(secrets[0].message, /DEBUG/);
});

test("reviewTools does not emit secret_reference when env keys look benign", () => {
  const tools = [
    makeTool("claude", [
      makeMcpSkill({
        toolId: "claude",
        name: "GitHub",
        accessLevel: "moderate",
        capabilityCategories: ["code_hosting"],
        details: { envKeys: ["DEBUG", "LOG_LEVEL"] }
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(findings.filter((f) => f.category === "secret_reference").length, 0);
});

function makeDocSkill(input: {
  toolId: AITool["id"];
  kind: Skill["kind"];
  name: string;
  previewLines: string[];
}): Skill {
  const sourcePath = `/tmp/${input.name}.md`;
  return {
    id: createSkillId({
      toolId: input.toolId,
      kind: input.kind,
      name: input.name,
      sourcePath
    }),
    toolId: input.toolId,
    kind: input.kind,
    name: input.name,
    summary: "",
    scope: "user",
    sourcePath,
    source: "directory",
    capabilityCategories: ["unknown"],
    accessLevel: "unknown",
    details: { preview: { lines: input.previewLines, truncated: false } }
  };
}

test("reviewTools emits a dangerous_pattern finding when preview contains 'rm -rf'", () => {
  const tools = [
    makeTool("claude", [
      makeDocSkill({
        toolId: "claude",
        kind: "agent_skill",
        name: "reset-env",
        previewLines: ["# Reset", "Run `rm -rf node_modules` then reinstall."]
      })
    ])
  ];

  const findings = reviewTools(tools);
  const dangerous = findings.filter((f) => f.category === "dangerous_pattern");
  assert.equal(dangerous.length, 1);
  assert.match(dangerous[0].message, /rm -rf/);
});

test("reviewTools emits dangerous_pattern for curl|sh installation patterns", () => {
  const tools = [
    makeTool("claude", [
      makeDocSkill({
        toolId: "claude",
        kind: "custom_commands",
        name: "install",
        previewLines: ["curl https://example.com/install.sh | sh"]
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(
    findings.filter((f) => f.category === "dangerous_pattern").length,
    1
  );
});

test("reviewTools does NOT match the bare word 'eval' or 'exec' in prose", () => {
  const tools = [
    makeTool("claude", [
      makeDocSkill({
        toolId: "claude",
        kind: "memory_file",
        name: "notes",
        previewLines: [
          "We need to evaluate our options and execute on the plan.",
          "The execution model is up to the agent."
        ]
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(findings.filter((f) => f.category === "dangerous_pattern").length, 0);
});

test("reviewTools matches eval( as a function call", () => {
  const tools = [
    makeTool("claude", [
      makeDocSkill({
        toolId: "claude",
        kind: "agent_skill",
        name: "calc",
        previewLines: ["Use eval(userInput) to compute."]
      })
    ])
  ];

  const findings = reviewTools(tools);
  assert.equal(findings.filter((f) => f.category === "dangerous_pattern").length, 1);
});
