import { createFinding, type AITool, type Finding, type Skill } from "../types.js";
import { isSecretLikeKey } from "./safety.js";

export function reviewTools(tools: readonly AITool[]): Finding[] {
  const findings: Finding[] = [];

  for (const tool of tools) {
    for (const skill of tool.skills) {
      const broad = reviewBroadAccess(skill);
      if (broad) findings.push(broad);

      const unknownFinding = reviewUnknownMcp(skill);
      if (unknownFinding) findings.push(unknownFinding);

      const secretFinding = reviewSecretEnvKeys(skill);
      if (secretFinding) findings.push(secretFinding);

      const danger = reviewDangerousPatterns(skill);
      if (danger) findings.push(danger);
    }
  }

  findings.push(...reviewDuplicateMcps(tools));

  return findings;
}

function reviewBroadAccess(skill: Skill): Finding | undefined {
  if (skill.accessLevel !== "broad") {
    return undefined;
  }

  if (skill.kind !== "mcp_server") {
    return undefined;
  }

  const categoryLabel = skill.capabilityCategories[0] ?? "broad";

  return createFinding({
    toolIds: [skill.toolId],
    title: `${skill.name} MCP has broad ${categoryLabel} access`,
    message:
      `The ${skill.name} MCP server is classified as broad ${categoryLabel} access. ` +
      `It can read or modify resources in that category with few restrictions.`,
    category: "broad_access_capability",
    accessLevel: "broad",
    scope: skill.scope,
    sourcePaths: [skill.sourcePath],
    relatedSkillIds: [skill.id],
    recommendation:
      `Review whether ${skill.name} actually needs broad access. If not, scope the ` +
      `credentials (e.g., read-only DB user, narrowed token) or remove the server.`
  });
}

function reviewUnknownMcp(skill: Skill): Finding | undefined {
  if (skill.kind !== "mcp_server") {
    return undefined;
  }

  if (skill.accessLevel !== "unknown") {
    return undefined;
  }

  return createFinding({
    toolIds: [skill.toolId],
    title: `${skill.name} MCP is not in Ankui's catalog`,
    message:
      `Ankui does not recognize the "${skill.name}" MCP server, so it cannot classify ` +
      `its capabilities. The server is wired up in ${skill.sourcePath} and may have ` +
      `any level of access.`,
    category: "unknown_capability",
    accessLevel: "unknown",
    scope: skill.scope,
    sourcePaths: [skill.sourcePath],
    relatedSkillIds: [skill.id],
    recommendation:
      `Read the server's docs or source to decide if it should be trusted. If you ` +
      `maintain it, consider sending a PR adding it to skill-naming.ts.`
  });
}

function reviewSecretEnvKeys(skill: Skill): Finding | undefined {
  if (skill.kind !== "mcp_server") {
    return undefined;
  }

  const envKeys = readEnvKeys(skill.details);
  if (envKeys.length === 0) {
    return undefined;
  }

  const secretLooking = envKeys.filter((key) => isSecretLikeKey(key));
  if (secretLooking.length === 0) {
    return undefined;
  }

  return createFinding({
    toolIds: [skill.toolId],
    title: `${skill.name} MCP references secret-like env keys`,
    message:
      `The ${skill.name} MCP server reads the following env variables that look ` +
      `secret-bearing: ${secretLooking.join(", ")}. Values themselves are never read ` +
      `or stored by Ankui.`,
    category: "secret_reference",
    accessLevel: skill.accessLevel,
    scope: skill.scope,
    sourcePaths: [skill.sourcePath],
    relatedSkillIds: [skill.id],
    recommendation:
      `Confirm those secrets live in your environment (not committed config) and that ` +
      `they are scoped to the minimum permissions the MCP actually needs.`
  });
}

function readEnvKeys(details: Skill["details"]): string[] {
  if (!details || typeof details !== "object") return [];
  const raw = (details as Record<string, unknown>).envKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string");
}

const DANGEROUS_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "eval()", regex: /\beval\s*\(/ },
  { name: "exec()", regex: /\bexec\s*\(/ },
  { name: "shell exec", regex: /(?:^|[;&|]\s*)exec\s+\S/m },
  { name: "rm -rf", regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/ },
  { name: "curl|sh", regex: /\bcurl\b[^\n]*\|\s*(?:sh|bash)\b/ },
  { name: "wget|sh", regex: /\bwget\b[^\n]*\|\s*(?:sh|bash)\b/ }
];

function reviewDangerousPatterns(skill: Skill): Finding | undefined {
  const previewText = readPreviewText(skill.details);
  if (!previewText) return undefined;

  const matched: string[] = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.regex.test(previewText)) {
      matched.push(pattern.name);
    }
  }

  if (matched.length === 0) return undefined;

  return createFinding({
    toolIds: [skill.toolId],
    title: `${skill.name} contains review-worthy command patterns`,
    message:
      `Ankui detected the following patterns in the preview of ${skill.sourcePath}: ` +
      `${matched.join(", ")}. These can be legitimate, but warrant a human review.`,
    category: "dangerous_pattern",
    accessLevel: skill.accessLevel === "unknown" ? "moderate" : skill.accessLevel,
    scope: skill.scope,
    sourcePaths: [skill.sourcePath],
    relatedSkillIds: [skill.id],
    recommendation:
      `Open ${skill.sourcePath} and confirm the matched lines are intentional. ` +
      `Treat any "curl | sh" or "rm -rf" patterns with extra scrutiny.`
  });
}

function readPreviewText(details: Skill["details"]): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const preview = (details as Record<string, unknown>).preview;
  if (!preview || typeof preview !== "object") return undefined;
  const lines = (preview as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return undefined;
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

function reviewDuplicateMcps(tools: readonly AITool[]): Finding[] {
  const byName = new Map<string, Skill[]>();

  for (const tool of tools) {
    for (const skill of tool.skills) {
      if (skill.kind !== "mcp_server") continue;
      const key = skill.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(skill);
      byName.set(key, list);
    }
  }

  const findings: Finding[] = [];

  for (const [, skills] of byName) {
    const uniqueTools = new Set(skills.map((s) => s.toolId));
    if (uniqueTools.size < 2) continue;

    const example = skills[0];

    findings.push(
      createFinding({
        toolIds: [...uniqueTools].sort(),
        title: `${example.name} MCP is configured in ${uniqueTools.size} tools`,
        message:
          `The ${example.name} MCP server is wired up in multiple AI tools ` +
          `(${[...uniqueTools].sort().join(", ")}). Each configuration carries its own ` +
          `credentials and access surface.`,
        category: "duplicate_mcp",
        accessLevel: example.accessLevel,
        scope: "cross_tool",
        sourcePaths: skills.map((s) => s.sourcePath),
        relatedSkillIds: skills.map((s) => s.id),
        recommendation:
          `If the duplication is unintentional, remove the extra configurations. ` +
          `Otherwise verify each instance uses an appropriately scoped credential.`
      })
    );
  }

  return findings;
}
