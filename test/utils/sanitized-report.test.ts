import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSanitizedReportModel,
  renderSanitizedReportMarkdown
} from "../../src/report/sanitized-report.js";
import {
  createAllEmptyTools,
  createFinding,
  createScanSummary,
  createSkillId,
  createToolStats,
  createWarning,
  type AITool,
  type MultiProjectScanResult,
  type ScanResult,
  type Skill
} from "../../src/types.js";

function scan(cwd: string, homeDir: string, tools: AITool[]): ScanResult {
  const findings = tools.flatMap((tool) => tool.findings);
  return {
    scannedAt: "2026-07-05T09:00:00.000Z",
    cwd,
    homeDir,
    tools,
    findings,
    warnings: [],
    summary: createScanSummary(tools)
  };
}

function skill(input: Partial<Skill> & Pick<Skill, "toolId" | "kind" | "name" | "sourcePath">): Skill {
  return {
    id: createSkillId({
      toolId: input.toolId,
      kind: input.kind,
      name: input.name,
      sourcePath: input.sourcePath
    }),
    toolId: input.toolId,
    kind: input.kind,
    name: input.name,
    summary: input.summary ?? "",
    scope: input.scope ?? "user",
    sourcePath: input.sourcePath,
    source: input.source ?? "config",
    capabilityCategories: input.capabilityCategories ?? ["unknown"],
    accessLevel: input.accessLevel ?? "unknown",
    details: input.details
  };
}

function toolWith(skillItems: Skill[]): AITool {
  const tool = createAllEmptyTools().find((t) => t.id === "claude")!;
  const findings = [
    createFinding({
      toolIds: ["claude"],
      title: "filesystem MCP references secret-like env keys",
      message:
        "The filesystem MCP reads OPENAI_API_KEY from /Users/alice/.claude/mcp.json.",
      category: "secret_reference",
      accessLevel: "broad",
      scope: "user",
      sourcePaths: ["/Users/alice/.claude/mcp.json"],
      relatedSkillIds: [skillItems[0].id],
      recommendation:
        "Open /Users/alice/.claude/mcp.json and verify OPENAI_API_KEY is scoped."
    }),
    createFinding({
      toolIds: ["claude"],
      title: "project command contains review-worthy command patterns",
      message:
        "Ankui detected rm -rf in /Users/alice/Developer/secret-app/.claude/commands/deploy.md.",
      category: "dangerous_pattern",
      accessLevel: "moderate",
      scope: "project",
      sourcePaths: ["/Users/alice/Developer/secret-app/.claude/commands/deploy.md"],
      relatedSkillIds: [skillItems[1].id],
      recommendation:
        "Open /Users/alice/Developer/secret-app/.claude/commands/deploy.md before sharing."
    })
  ];
  return {
    ...tool,
    detected: true,
    detectedPaths: ["/Users/alice/.claude"],
    skills: skillItems,
    findings,
    stats: createToolStats(skillItems, findings)
  };
}

function multi(): MultiProjectScanResult {
  const homeDir = "/Users/alice";
  const projectPath = "/Users/alice/Developer/secret-app";
  const userSkill = skill({
    toolId: "claude",
    kind: "mcp_server",
    name: "filesystem",
    sourcePath: "/Users/alice/.claude/mcp.json",
    details: { envKeys: ["OPENAI_API_KEY", "NORMAL_VALUE"] },
    accessLevel: "broad",
    capabilityCategories: ["filesystem"]
  });
  const projectSkill = skill({
    toolId: "claude",
    kind: "custom_commands",
    name: "deploy",
    scope: "project",
    sourcePath: `${projectPath}/.claude/commands/deploy.md`,
    details: { preview: { lines: ["rm -rf build"] } },
    accessLevel: "moderate",
    capabilityCategories: ["shell"]
  });
  const userTool = toolWith([userSkill, projectSkill]);
  const userScope = scan(homeDir, homeDir, [userTool, ...createAllEmptyTools().filter((t) => t.id !== "claude")]);
  const projectScan = scan(projectPath, homeDir, createAllEmptyTools());

  return {
    scannedAt: "2026-07-05T09:00:00.000Z",
    cwd: homeDir,
    homeDir,
    devRoots: ["/Users/alice/Developer"],
    userScope,
    projects: [
      {
        projectPath,
        displayPath: "~/Developer/secret-app",
        scan: projectScan
      }
    ],
    warnings: [
      createWarning({
        reason: "permission_denied",
        path: "/Users/alice/Developer/secret-app/.codex/session.json",
        message:
          "Cannot read /Users/alice/Developer/secret-app/.codex/session.json; see /etc/ankui-debug.log"
      })
    ],
    totals: {
      projectCount: 1,
      skillsAcrossProjects: 0,
      userScopeSkills: 2
    }
  };
}

test("buildSanitizedReportModel anonymizes local paths and secret env key names", () => {
  const model = buildSanitizedReportModel(multi(), {
    generatedAt: "2026-07-05T10:00:00.000Z"
  });
  const raw = JSON.stringify(model);

  assert.equal(model.privacy, "strict");
  assert.equal(model.summary.totalSkills, 2);
  assert.match(raw, /<HOME>\/\.claude\/mcp\.json/);
  assert.match(raw, /<PROJECT_1>\/\.codex\/session\.json/);
  assert.match(raw, /<PATH_1>/);
  assert.doesNotMatch(raw, /\/Users\/alice/);
  assert.doesNotMatch(raw, /secret-app/);
  assert.doesNotMatch(raw, /Developer/);
  assert.doesNotMatch(raw, /OPENAI_API_KEY/);
  assert.doesNotMatch(raw, /NORMAL_VALUE/);
  const secret = model.findings.find((finding) => finding.category === "secret_reference");
  assert.ok(secret);
  assert.match(secret.message, /Variable names and values are omitted/);
});

test("renderSanitizedReportMarkdown renders executive sections without raw inventory details", () => {
  const model = buildSanitizedReportModel(multi(), {
    generatedAt: "2026-07-05T10:00:00.000Z"
  });
  const markdown = renderSanitizedReportMarkdown(model);

  assert.match(markdown, /^# Ankui Sanitized Report\n/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Tool Overview/);
  assert.match(markdown, /## Access Findings/);
  assert.match(markdown, /## Warnings/);
  assert.match(markdown, /Strict privacy mode anonymizes local paths/);
  assert.doesNotMatch(markdown, /rm -rf build/);
  assert.doesNotMatch(markdown, /\/Users\/alice/);
  assert.doesNotMatch(markdown, /OPENAI_API_KEY/);
});
