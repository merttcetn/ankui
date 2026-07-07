import path from "node:path";

import type {
  AITool,
  Finding,
  MultiProjectScanResult,
  Skill,
  Warning
} from "../types.js";
import {
  SNAPSHOT_VERSION,
  type SnapshotDocument,
  type SnapshotEntity,
  type SnapshotFinding,
  type SnapshotMetadata,
  type SnapshotToolState,
  type SnapshotValue,
  type SnapshotWarning
} from "./types.js";

const SAFE_DETAIL_KEYS = new Set([
  "alwaysApply",
  "args",
  "builtin",
  "command",
  "configPath",
  "disabled",
  "envKeys",
  "globs",
  "keys",
  "linked",
  "linkTarget",
  "pluginName",
  "url",
  "version"
]);

export interface BuildSnapshotOptions {
  id: string;
  createdAt?: string;
  label?: string;
}

export function buildSnapshotDocument(
  result: MultiProjectScanResult,
  options: BuildSnapshotOptions
): SnapshotDocument {
  const normalizePath = createPathNormalizer(result.homeDir);
  const tools: SnapshotToolState[] = [];
  const entities: SnapshotEntity[] = [];
  const findings: SnapshotFinding[] = [];
  const warnings: SnapshotWarning[] = [];

  appendContext({
    context: "user",
    tools: result.userScope.tools,
    scanFindings: result.userScope.findings,
    scanWarnings: [...result.warnings, ...result.userScope.warnings],
    normalizePath,
    includeSkill: () => true,
    includeWarning: () => true,
    out: { tools, entities, findings, warnings }
  });

  for (const project of result.projects) {
    const context = `project:${normalizePath(project.projectPath)}`;
    appendContext({
      context,
      tools: project.scan.tools,
      scanFindings: project.scan.findings,
      scanWarnings: project.scan.warnings,
      normalizePath,
      includeSkill: (skill) => skill.scope === "project",
      includeWarning: (warning) =>
        !warning.path || isWithin(warning.path, project.projectPath),
      out: { tools, entities, findings, warnings }
    });
  }

  return {
    version: SNAPSHOT_VERSION,
    id: options.id,
    createdAt: options.createdAt ?? result.scannedAt,
    ...(options.label ? { label: options.label } : {}),
    projectCount: result.projects.length,
    tools: uniqueByKey(tools).sort(compareKey),
    entities: uniqueByKey(entities).sort(compareKey),
    findings: uniqueByKey(findings).sort(compareKey),
    warnings: uniqueByKey(warnings).sort(compareKey)
  };
}

export function snapshotMetadata(document: SnapshotDocument): SnapshotMetadata {
  return {
    id: document.id,
    createdAt: document.createdAt,
    ...(document.label ? { label: document.label } : {}),
    projects: document.projectCount,
    entities: document.entities.length,
    findings: document.findings.length,
    warnings: document.warnings.length
  };
}

function appendContext(input: {
  context: string;
  tools: readonly AITool[];
  scanFindings: readonly Finding[];
  scanWarnings: readonly Warning[];
  normalizePath: (value: string) => string;
  includeSkill: (skill: Skill) => boolean;
  includeWarning: (warning: Warning) => boolean;
  out: {
    tools: SnapshotToolState[];
    entities: SnapshotEntity[];
    findings: SnapshotFinding[];
    warnings: SnapshotWarning[];
  };
}): void {
  const idToEntityKey = new Map<string, string>();
  for (const tool of input.tools) {
    const includedSkills = tool.skills.filter(input.includeSkill);
    const detected = input.context === "user"
      ? tool.detected || includedSkills.length > 0
      : includedSkills.length > 0;
    if (detected) {
      input.out.tools.push({
        key: `${input.context}|tool|${tool.id}`,
        context: input.context,
        toolId: tool.id,
        detected: true
      });
    }

    for (const skill of includedSkills) {
      const entity = projectEntity(skill, input.context, input.normalizePath);
      input.out.entities.push(entity);
      idToEntityKey.set(skill.id, entity.key);
    }
  }

  for (const finding of input.scanFindings) {
    const related = finding.relatedSkillIds
      .map((id) => idToEntityKey.get(id))
      .filter((value): value is string => Boolean(value));
    if (input.context !== "user" && finding.scope !== "project" && related.length === 0) {
      continue;
    }
    input.out.findings.push(
      projectFinding(finding, input.context, related, input.normalizePath)
    );
  }

  for (const warning of input.scanWarnings) {
    if (!input.includeWarning(warning)) continue;
    input.out.warnings.push(projectWarning(warning, input.context, input.normalizePath));
  }
}

function projectEntity(
  skill: Skill,
  context: string,
  normalizePath: (value: string) => string
): SnapshotEntity {
  const sourcePath = normalizePath(skill.sourcePath);
  const identity = [
    context,
    skill.toolId,
    skill.kind,
    skill.name.toLowerCase(),
    canonicalIdentityPath(sourcePath)
  ].join("|");
  return {
    key: identity,
    context,
    toolId: skill.toolId,
    kind: skill.kind,
    name: skill.name,
    summary: skill.summary,
    scope: skill.scope,
    source: skill.source,
    sourcePath,
    capabilityCategories: [...skill.capabilityCategories].sort(),
    accessLevel: skill.accessLevel,
    attributes: safeAttributes(skill.details, normalizePath)
  };
}

function canonicalIdentityPath(sourcePath: string): string {
  return sourcePath.replace(/\/\.disabled\//g, "/");
}

function projectFinding(
  finding: Finding,
  context: string,
  relatedEntityKeys: string[],
  normalizePath: (value: string) => string
): SnapshotFinding {
  const related = [...relatedEntityKeys].sort();
  const toolIds = [...finding.toolIds].sort();
  const fallbackSources = finding.sourcePaths.map(normalizePath).sort();
  const identityParts = related.length > 0 ? related : fallbackSources;
  return {
    key: [context, "finding", finding.category, toolIds.join(","), identityParts.join(",")].join("|"),
    context,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    accessLevel: finding.accessLevel,
    scope: finding.scope,
    toolIds,
    relatedEntityKeys: related
  };
}

function projectWarning(
  warning: Warning,
  context: string,
  normalizePath: (value: string) => string
): SnapshotWarning {
  const warningPath = warning.path ? normalizePath(warning.path) : undefined;
  return {
    key: [context, "warning", warning.reason, warningPath ?? warning.message].join("|"),
    context,
    reason: warning.reason,
    ...(warningPath ? { path: warningPath } : {}),
    message: normalizeTextPaths(warning.message, normalizePath)
  };
}

function safeAttributes(
  details: Skill["details"],
  normalizePath: (value: string) => string
): Record<string, SnapshotValue> {
  if (!details) return {};
  const output: Record<string, SnapshotValue> = {};
  for (const key of Object.keys(details).sort()) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue;
    const value = toSnapshotValue(details[key], key === "linkTarget" ? normalizePath : undefined);
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function toSnapshotValue(
  value: unknown,
  mapString?: (value: string) => string
): SnapshotValue | undefined {
  if (typeof value === "string") return mapString ? mapString(value) : value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    const array = value
      .map((entry) => toSnapshotValue(entry, mapString))
      .filter((entry): entry is SnapshotValue => entry !== undefined);
    return array.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  }
  return undefined;
}

function createPathNormalizer(homeDir: string): (value: string) => string {
  const resolvedHome = path.resolve(homeDir);
  return (value: string): string => {
    if (value === "~" || value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
      return value.replaceAll(path.sep, "/");
    }
    if (!path.isAbsolute(value)) return value.replaceAll(path.sep, "/");
    const resolved = path.resolve(value);
    if (resolved === resolvedHome) return "~";
    if (isWithin(resolved, resolvedHome)) {
      return `~/${path.relative(resolvedHome, resolved).split(path.sep).join("/")}`;
    }
    return resolved.split(path.sep).join("/");
  };
}

function normalizeTextPaths(
  value: string,
  normalizePath: (value: string) => string
): string {
  return value.replace(/(?:\/[^\s:,;]+)+/g, (candidate) => normalizePath(candidate));
}

function isWithin(candidate: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function uniqueByKey<T extends { key: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.key, value])).values()];
}

function compareKey(a: { key: string }, b: { key: string }): number {
  return a.key.localeCompare(b.key);
}

function stableStringify(value: SnapshotValue): string {
  return JSON.stringify(value);
}
