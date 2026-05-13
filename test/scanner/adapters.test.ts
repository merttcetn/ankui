import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runScannerAdapters, type ScannerAdapter } from "../../src/scanner/adapters/index.js";
import { scan } from "../../src/scanner/index.js";
import { MASKED_SECRET } from "../../src/scanner/safety.js";
import { createSkillId, type Skill, type ToolId } from "../../src/types.js";

test("adapter runner turns timeouts into warnings", async () => {
  const adapter: ScannerAdapter = {
    toolId: "claude",
    scan: async () => new Promise(() => undefined)
  };

  const result = await runScannerAdapters(
    [adapter],
    { cwd: "/", homeDir: "/", env: {}, discoveredPaths: [] },
    { timeoutMs: 10 }
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.toolId, "claude");
  assert.equal(result[0]?.skills.length, 0);
  assert.equal(result[0]?.warnings[0]?.reason, "adapter_timeout");
});

test("adapter runner isolates thrown adapter failures", async () => {
  const workingSkill = makeSkill("claude", "working");
  const adapters: ScannerAdapter[] = [
    {
      toolId: "claude",
      scan: async () => ({ skills: [workingSkill], warnings: [] })
    },
    {
      toolId: "codex",
      scan: async () => {
        throw new Error("boom");
      }
    }
  ];

  const result = await runScannerAdapters(adapters, {
    cwd: "/",
    homeDir: "/",
    env: {},
    discoveredPaths: []
  });

  assert.equal(result.find((entry) => entry.toolId === "claude")?.skills[0], workingSkill);
  assert.equal(result.find((entry) => entry.toolId === "codex")?.warnings[0]?.reason, "unknown");
});

test("Claude adapter extracts MCP, memory, agents, commands, skills, settings, and warnings", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.writeFile(
    path.join(homeDir, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        github: {
          command: "github-mcp",
          args: ["--repo", "owner/name"],
          env: {
            GITHUB_TOKEN: "ghp_secretsecretsecret"
          }
        }
      }
    })
  );
  await fs.writeFile(
    path.join(cwd, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        postgres: {
          command: "pg-mcp",
          env: {
            DATABASE_PASSWORD: "plain-secret"
          }
        }
      }
    })
  );
  await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".claude", "settings.json"),
    JSON.stringify({
      permissions: {
        allow: ["Read(*)"]
      },
      plugins: ["review-plugin"]
    })
  );
  await fs.writeFile(
    path.join(cwd, "CLAUDE.md"),
    Array.from({ length: 12 }, (_value, index) =>
      index === 3 ? "GITHUB_TOKEN=ghp_secretsecretsecret" : `line ${index + 1}`
    ).join("\n")
  );
  await fs.mkdir(path.join(cwd, ".claude", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".claude", "agents", "reviewer.md"),
    "---\nname: code-reviewer\ndescription: Reviews patches\n---\n# Reviewer"
  );
  await fs.writeFile(
    path.join(cwd, ".claude", "agents", "broken.md"),
    "---\nname: [\n---\n# Broken"
  );
  await fs.mkdir(path.join(cwd, ".claude", "commands", "git"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".claude", "commands", "git", "status.md"),
    "---\ndescription: Shows status\n---\n# Status"
  );
  await fs.mkdir(path.join(cwd, ".claude", "skills", "triage"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".claude", "skills", "triage", "SKILL.md"),
    "---\nname: issue-triage\ndescription: Triage issues\n---\n# Triage"
  );

  const result = await scan({
    cwd,
    homeDir,
    env: {},
    now: new Date("2026-05-12T00:00:00.000Z")
  });
  const claude = tool(result, "claude");

  assert.equal(claude.detected, true);
  assert.ok(claude.detectedPaths.includes(path.join(cwd, ".mcp.json")));
  assert.equal(claude.stats.mcpServers, 2);
  assert.equal(claude.stats.memoryFiles, 1);
  assert.equal(claude.stats.customAgents, 2);
  assert.equal(claude.stats.customCommands, 1);
  assert.equal(claude.stats.agentSkills, 1);
  assert.equal(claude.stats.rules, 1);
  assert.equal(claude.stats.plugins, 1);

  assert.ok(skill(claude.skills, "mcp_server", "GitHub"));
  assert.ok(skill(claude.skills, "mcp_server", "Postgres"));
  assert.ok(skill(claude.skills, "custom_agents", "code-reviewer"));
  assert.ok(skill(claude.skills, "custom_agents", "broken"));
  assert.ok(skill(claude.skills, "custom_commands", "git/status"));
  assert.ok(skill(claude.skills, "agent_skill", "issue-triage"));
  assert.ok(skill(claude.skills, "rules", "Project Claude permissions"));
  assert.ok(skill(claude.skills, "plugins", "review-plugin"));

  const memory = skill(claude.skills, "memory_file", "CLAUDE.md");
  const memoryDetails = memory?.details as
    | { preview?: { lines?: string[] }; lineCount?: number }
    | undefined;

  assert.equal(memoryDetails?.lineCount, 12);
  assert.equal(memoryDetails?.preview?.lines?.length, 10);
  assert.equal(memoryDetails?.preview?.lines?.[3], `GITHUB_TOKEN=${MASKED_SECRET}`);

  const mcpDetails = skill(claude.skills, "mcp_server", "GitHub")?.details as
    | { preview?: unknown }
    | undefined;
  assert.equal(mcpDetails?.preview, undefined);

  assert.ok(claude.warnings.some((warning) => warning.reason === "parse_failed"));
  assert.ok(result.warnings.some((warning) => warning.reason === "parse_failed"));
  assert.equal(JSON.stringify(result).includes("ghp_secretsecretsecret"), false);
  assert.equal(JSON.stringify(result).includes("plain-secret"), false);
});

test("Claude adapter reports broken JSON without crashing scan", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
  await fs.writeFile(path.join(cwd, ".claude", "settings.json"), "{");

  const result = await scan({ cwd, homeDir, env: {} });
  const claude = tool(result, "claude");

  assert.equal(claude.detected, true);
  assert.ok(claude.warnings.some((warning) => warning.reason === "parse_failed"));
});

test("Claude adapter does not read project paths rejected by discovery", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.writeFile(path.join(cwd, ".gitignore"), ".mcp.json\n.claude/\n");
  await fs.writeFile(
    path.join(cwd, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        ignored: {
          command: "ignored-mcp"
        }
      }
    })
  );
  await fs.mkdir(path.join(cwd, ".claude", "agents"), { recursive: true });
  await fs.writeFile(path.join(cwd, ".claude", "agents", "ignored.md"), "# Ignored");

  const result = await scan({ cwd, homeDir, env: {} });
  const claude = tool(result, "claude");

  assert.equal(skill(claude.skills, "mcp_server", "ignored"), undefined);
  assert.equal(skill(claude.skills, "custom_agents", "ignored"), undefined);
});

test("Claude adapter masks credentials in MCP URL fields", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.writeFile(
    path.join(cwd, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        postgres: {
          url: "postgresql://admin:s3cret@localhost:5432/mydb"
        },
        basic: {
          serverUrl: "https://user:hunter2@api.example.com/mcp"
        }
      }
    })
  );

  const result = await scan({ cwd, homeDir, env: {} });

  assert.equal(JSON.stringify(result).includes("s3cret"), false);
  assert.equal(JSON.stringify(result).includes("hunter2"), false);
  assert.ok(JSON.stringify(result).includes("localhost"));
  assert.ok(JSON.stringify(result).includes("api.example.com"));
});

test("Claude adapter masks credentials in MCP args", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.writeFile(
    path.join(cwd, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        pg: {
          command: "pg-mcp",
          args: ["--connection", "postgresql://user:topsecret@db.internal/prod"]
        }
      }
    })
  );

  const result = await scan({ cwd, homeDir, env: {} });

  assert.equal(JSON.stringify(result).includes("topsecret"), false);
  assert.ok(JSON.stringify(result).includes("db.internal"));
});

test("Claude adapter honours per-file gitignore for settings.local.json", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".claude", "settings.json"),
    JSON.stringify({ permissions: { allow: ["Read(*)"] } })
  );
  await fs.writeFile(
    path.join(cwd, ".claude", "settings.local.json"),
    JSON.stringify({ permissions: { allow: ["Bash(*)"] } })
  );
  await fs.writeFile(path.join(cwd, ".gitignore"), ".claude/settings.local.json\n");

  const result = await scan({ cwd, homeDir, env: {} });
  const claude = tool(result, "claude");

  const permSkills = claude.skills.filter((s) => s.kind === "rules");

  assert.equal(permSkills.length, 1);
  assert.ok(permSkills[0]?.sourcePath.endsWith("settings.json"));
});

test("Claude adapter skips gitignored agent files when .claude/ is not ignored", async () => {
  const cwd = await makeTempWorkspace("ankui-claude-cwd-");
  const homeDir = await makeTempWorkspace("ankui-claude-home-");

  await fs.mkdir(path.join(cwd, ".claude", "agents"), { recursive: true });
  await fs.writeFile(path.join(cwd, ".claude", "agents", "public.md"), "# Public Agent");
  await fs.writeFile(path.join(cwd, ".claude", "agents", "private.md"), "# Private Agent");
  await fs.writeFile(path.join(cwd, ".gitignore"), ".claude/agents/private.md\n");

  const result = await scan({ cwd, homeDir, env: {} });
  const claude = tool(result, "claude");

  assert.ok(skill(claude.skills, "custom_agents", "public"));
  assert.equal(skill(claude.skills, "custom_agents", "private"), undefined);
});

test("Codex adapter extracts MCP servers, prompts, and memory file", async () => {
  const cwd = await makeTempWorkspace("ankui-codex-cwd-");
  const homeDir = await makeTempWorkspace("ankui-codex-home-");

  await fs.mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".codex", "config.toml"),
    [
      "[mcp_servers.github]",
      'command = "github-mcp"',
      'args = ["--token", "ghp_fakefakefake"]',
      "",
      "[mcp_servers.filesystem]",
      'command = "fs-mcp"'
    ].join("\n")
  );
  await fs.mkdir(path.join(homeDir, ".codex", "prompts"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".codex", "prompts", "review.md"),
    "---\nname: code-review\ndescription: Review code\n---\n# Review"
  );
  await fs.writeFile(path.join(cwd, "AGENTS.md"), "# Codex Rules");

  const result = await scan({ cwd, homeDir, env: {} });
  const codex = tool(result, "codex");

  assert.equal(codex.detected, true);
  assert.equal(codex.stats.mcpServers, 2);
  assert.equal(codex.stats.memoryFiles, 1);
  assert.equal(codex.stats.customPrompts, 1);
  assert.ok(skill(codex.skills, "mcp_server", "GitHub"));
  assert.ok(skill(codex.skills, "mcp_server", "Filesystem"));
  assert.ok(skill(codex.skills, "custom_prompts", "code-review"));
  assert.ok(skill(codex.skills, "memory_file", "AGENTS.md"));
  assert.equal(JSON.stringify(result).includes("ghp_fakefakefake"), false);
});

test("Cursor adapter extracts MCP servers, rules, and cursorrules memory file", async () => {
  const cwd = await makeTempWorkspace("ankui-cursor-cwd-");
  const homeDir = await makeTempWorkspace("ankui-cursor-home-");

  await fs.writeFile(
    path.join(cwd, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        postgres: { command: "pg-mcp", env: { DATABASE_URL: "postgresql://user:pass@localhost/db" } }
      }
    })
  );
  await fs.mkdir(path.join(cwd, ".cursor", "rules"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".cursor", "rules", "typescript.mdc"),
    "---\ndescription: TypeScript rules\nglobs: '**/*.ts'\n---\n# TS Rules"
  );
  await fs.writeFile(path.join(cwd, ".cursorrules"), "# Project rules");

  const result = await scan({ cwd, homeDir, env: {} });
  const cursor = tool(result, "cursor");

  assert.equal(cursor.detected, true);
  assert.equal(cursor.stats.mcpServers, 1);
  assert.equal(cursor.stats.rules, 1);
  assert.equal(cursor.stats.memoryFiles, 1);
  assert.ok(skill(cursor.skills, "mcp_server", "Postgres"));
  assert.ok(skill(cursor.skills, "rules", "typescript"));
  assert.ok(skill(cursor.skills, "memory_file", ".cursorrules"));
  assert.equal(JSON.stringify(result).includes("pass"), false);
});

test("Gemini adapter extracts MCP servers, commands, and memory file", async () => {
  const cwd = await makeTempWorkspace("ankui-gemini-cwd-");
  const homeDir = await makeTempWorkspace("ankui-gemini-home-");

  await fs.mkdir(path.join(homeDir, ".gemini"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".gemini", "settings.json"),
    JSON.stringify({
      mcpServers: {
        github: { command: "github-mcp" }
      }
    })
  );
  await fs.mkdir(path.join(homeDir, ".gemini", "commands"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".gemini", "commands", "review.md"),
    "---\ndescription: Code review command\n---\n# Review"
  );
  await fs.writeFile(path.join(cwd, "GEMINI.md"), "Gemini memory file.");

  const result = await scan({ cwd, homeDir, env: {} });
  const gemini = tool(result, "gemini");

  assert.equal(gemini.detected, true);
  assert.equal(gemini.stats.mcpServers, 1);
  assert.equal(gemini.stats.customCommands, 1);
  assert.equal(gemini.stats.memoryFiles, 1);
  assert.ok(skill(gemini.skills, "mcp_server", "GitHub"));
  assert.ok(skill(gemini.skills, "custom_commands", "review"));
  assert.ok(skill(gemini.skills, "memory_file", "GEMINI.md"));
});

test(
  "Gemini adapter follows skill directories symlinked within the home dir and marks them linked",
  {
    skip: process.platform === "win32" ? "Symlink creation is environment-dependent on Windows" : false
  },
  async () => {
    const cwd = await makeTempWorkspace("ankui-gemini-cwd-");
    const homeDir = await makeTempWorkspace("ankui-gemini-home-");

    const sharedSkillsRoot = path.join(homeDir, "shared-skills");
    const realSkillDir = path.join(sharedSkillsRoot, "autoplan");
    await fs.mkdir(realSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(realSkillDir, "SKILL.md"),
      "---\nname: autoplan\ndescription: Plan ahead\n---\n# Autoplan"
    );

    const geminiSkillsDir = path.join(homeDir, ".gemini", "skills");
    await fs.mkdir(geminiSkillsDir, { recursive: true });
    await fs.symlink(realSkillDir, path.join(geminiSkillsDir, "autoplan"), "dir");

    const result = await scan({ cwd, homeDir, env: {} });
    const gemini = tool(result, "gemini");

    const found = skill(gemini.skills, "agent_skill", "autoplan");
    assert.ok(found, "expected Gemini to report the symlinked autoplan skill");
    assert.equal(found?.details?.linked, true);
    assert.equal(typeof found?.details?.linkTarget, "string");
  }
);

test(
  "Gemini adapter does NOT follow skill directories pointing outside the home dir",
  {
    skip: process.platform === "win32" ? "Symlink creation is environment-dependent on Windows" : false
  },
  async () => {
    const cwd = await makeTempWorkspace("ankui-gemini-cwd-");
    const homeDir = await makeTempWorkspace("ankui-gemini-home-");
    const outsideRoot = await makeTempWorkspace("ankui-outside-");

    const outsideSkillDir = path.join(outsideRoot, "stealth");
    await fs.mkdir(outsideSkillDir, { recursive: true });
    await fs.writeFile(path.join(outsideSkillDir, "SKILL.md"), "# Stealth");

    const geminiSkillsDir = path.join(homeDir, ".gemini", "skills");
    await fs.mkdir(geminiSkillsDir, { recursive: true });
    await fs.symlink(outsideSkillDir, path.join(geminiSkillsDir, "stealth"), "dir");

    const result = await scan({ cwd, homeDir, env: {} });
    const gemini = tool(result, "gemini");

    assert.equal(skill(gemini.skills, "agent_skill", "stealth"), undefined);
    assert.ok(
      gemini.warnings.some((warning) => warning.reason === "symlink_skipped"),
      "expected a symlink_skipped warning for the outside-allowlist symlink"
    );
  }
);

test("OpenCode adapter extracts MCP, agents, commands, skills, plugins, and memory", async () => {
  const cwd = await makeTempWorkspace("ankui-opencode-cwd-");
  const homeDir = await makeTempWorkspace("ankui-opencode-home-");

  await fs.writeFile(
    path.join(cwd, "opencode.json"),
    JSON.stringify({
      mcp: {
        postgres: { command: "pg-mcp" }
      },
      plugins: ["review-plugin"],
      tools: { bash: true, edit: true }
    })
  );
  await fs.mkdir(path.join(cwd, ".opencode", "agent"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".opencode", "agent", "triage.md"),
    "---\nname: issue-triage\ndescription: Triage issues\n---\n# Triage"
  );
  await fs.mkdir(path.join(cwd, ".opencode", "command"), { recursive: true });
  await fs.writeFile(path.join(cwd, ".opencode", "command", "review.md"), "# Review");
  await fs.mkdir(path.join(cwd, ".opencode", "skills", "commit"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".opencode", "skills", "commit", "SKILL.md"),
    "---\nname: commit-helper\n---\n# Commit"
  );
  await fs.writeFile(path.join(cwd, "AGENTS.md"), "# OpenCode Instructions");

  const result = await scan({ cwd, homeDir, env: {} });
  const opencode = tool(result, "opencode");

  assert.equal(opencode.detected, true);
  assert.equal(opencode.stats.mcpServers, 1);
  assert.equal(opencode.stats.plugins, 1);
  assert.equal(opencode.stats.rules, 1);
  assert.equal(opencode.stats.customAgents, 1);
  assert.equal(opencode.stats.customCommands, 1);
  assert.equal(opencode.stats.agentSkills, 1);
  assert.equal(opencode.stats.memoryFiles, 1);
  assert.ok(skill(opencode.skills, "mcp_server", "Postgres"));
  assert.ok(skill(opencode.skills, "plugins", "review-plugin"));
  assert.ok(skill(opencode.skills, "rules", "Project OpenCode tools"));
  assert.ok(skill(opencode.skills, "custom_agents", "issue-triage"));
  assert.ok(skill(opencode.skills, "custom_commands", "review"));
  assert.ok(skill(opencode.skills, "agent_skill", "commit-helper"));
  assert.ok(skill(opencode.skills, "memory_file", "AGENTS.md"));
});

test("skills-sh adapter extracts skills from SKILL.md and README.md", async () => {
  const cwd = await makeTempWorkspace("ankui-skillssh-cwd-");
  const homeDir = await makeTempWorkspace("ankui-skillssh-home-");

  await fs.mkdir(path.join(homeDir, ".skills", "code-review"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".skills", "code-review", "SKILL.md"),
    "---\nname: code-review\ndescription: Reviews code\n---\n# Code Review"
  );
  await fs.mkdir(path.join(cwd, ".skills", "deploy"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".skills", "deploy", "README.md"),
    "Deploy applications."
  );

  const result = await scan({ cwd, homeDir, env: {} });
  const skillsSh = tool(result, "skills-sh");

  assert.equal(skillsSh.detected, true);
  assert.equal(skillsSh.stats.skillsShSkills, 2);
  assert.ok(skill(skillsSh.skills, "skills_sh_skill", "code-review"));
  assert.ok(skill(skillsSh.skills, "skills_sh_skill", "deploy"));
});

test("scan enriches MCP server skills with capability + access level", async () => {
  const cwd = await makeTempWorkspace("ankui-enrich-cwd-");
  const homeDir = await makeTempWorkspace("ankui-enrich-home-");

  await fs.mkdir(path.join(homeDir, ".cursor"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        "postgres-mcp": { command: "pg" },
        "internal-mystery": { command: "x" }
      }
    })
  );

  const result = await scan({ cwd, homeDir, env: {} });
  const cursor = tool(result, "cursor");

  const postgres = cursor.skills.find((s) => s.kind === "mcp_server" && s.name === "Postgres");
  assert.ok(postgres, "expected Postgres MCP to be canonicalized");
  assert.deepEqual(postgres.capabilityCategories, ["database"]);
  assert.equal(postgres.accessLevel, "broad");

  const unknown = cursor.skills.find(
    (s) => s.kind === "mcp_server" && s.name === "internal-mystery"
  );
  assert.ok(unknown, "expected the unknown MCP to keep its raw name");
  assert.deepEqual(unknown.capabilityCategories, ["unknown"]);
  assert.equal(unknown.accessLevel, "unknown");

  const cursorFindings = cursor.findings.map((f) => f.category);
  assert.ok(
    cursorFindings.includes("unknown_capability"),
    "expected unknown_capability finding for internal-mystery"
  );
  assert.ok(
    result.findings.some((f) => f.category === "unknown_capability"),
    "expected the same finding to bubble up to result.findings"
  );
  assert.equal(
    cursor.stats.findings,
    cursor.findings.length,
    "tool stats must reflect findings count after enrichment"
  );
});

async function makeTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeSkill(toolId: ToolId, name: string): Skill {
  return {
    id: createSkillId({
      toolId,
      kind: "memory_file",
      name,
      sourcePath: `${name}.md`
    }),
    toolId,
    kind: "memory_file",
    name,
    summary: name,
    scope: "project",
    sourcePath: `${name}.md`,
    source: "directory",
    capabilityCategories: ["unknown"],
    accessLevel: "unknown"
  };
}

function tool(result: Awaited<ReturnType<typeof scan>>, toolId: ToolId) {
  const foundTool = result.tools.find((entry) => entry.id === toolId);

  assert.ok(foundTool, `Missing tool ${toolId}`);
  return foundTool;
}

function skill(skills: Skill[], kind: Skill["kind"], name: string): Skill | undefined {
  return skills.find((entry) => entry.kind === kind && entry.name === name);
}
