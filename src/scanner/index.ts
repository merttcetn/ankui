import os from "node:os";

import {
  createAllEmptyTools,
  createScanSummary,
  createToolStats,
  type AITool,
  type ScanResult,
  type Warning
} from "../types.js";
import { claudeAdapter } from "./adapters/claude.js";
import { codexAdapter } from "./adapters/codex.js";
import { cursorAdapter } from "./adapters/cursor.js";
import { geminiAdapter } from "./adapters/gemini.js";
import { opencodeAdapter } from "./adapters/opencode.js";
import { skillsShAdapter } from "./adapters/skills-sh.js";
import { runScannerAdapters } from "./adapters/index.js";
import { discover, isIgnoredByRootGitignore } from "./discovery.js";

export interface ScanOptions {
  cwd?: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  now?: Date;
}

export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? os.homedir();
  const tools = createAllEmptyTools();
  const discovery = await discover({
    cwd,
    homeDir,
    env: options.env ?? process.env
  });

  for (const discoveredPath of discovery.paths) {
    const tool = findTool(tools, discoveredPath.toolId);

    if (!tool) {
      continue;
    }

    tool.detected = true;

    if (!tool.detectedPaths.includes(discoveredPath.path)) {
      tool.detectedPaths.push(discoveredPath.path);
    }
  }

  for (const skippedPath of discovery.skippedPaths) {
    if (!skippedPath.toolId) {
      continue;
    }

    const tool = findTool(tools, skippedPath.toolId);

    if (!tool || tool.warnings.some((warning) => warning.id === skippedPath.warning.id)) {
      continue;
    }

    tool.warnings.push(skippedPath.warning);
  }

  const adapterResults = await runScannerAdapters(
    [claudeAdapter, codexAdapter, cursorAdapter, geminiAdapter, opencodeAdapter, skillsShAdapter],
    {
      cwd,
      homeDir,
      env: options.env ?? process.env,
      discoveredPaths: discovery.paths,
      isIgnored: (rel) => isIgnoredByRootGitignore(rel, discovery.gitignorePatterns)
    }
  );

  for (const adapterResult of adapterResults) {
    const tool = findTool(tools, adapterResult.toolId);

    if (!tool) {
      continue;
    }

    tool.skills.push(...adapterResult.skills);
    tool.findings.push(...adapterResult.findings);
    addWarnings(tool.warnings, adapterResult.warnings);
  }

  for (const tool of tools) {
    tool.stats = createToolStats(tool.skills, tool.findings);
  }

  const findings = tools.flatMap((tool) => tool.findings);
  const warnings = dedupeWarnings([
    ...discovery.warnings,
    ...tools.flatMap((tool) => tool.warnings)
  ]);

  return {
    scannedAt: (options.now ?? new Date()).toISOString(),
    cwd,
    homeDir,
    tools,
    findings,
    warnings,
    summary: createScanSummary(tools)
  };
}

function findTool(tools: AITool[], toolId: AITool["id"]): AITool | undefined {
  return tools.find((tool) => tool.id === toolId);
}

function addWarnings(target: Warning[], warnings: readonly Warning[]): void {
  const seen = new Set(target.map((warning) => warning.id));

  for (const warning of warnings) {
    if (seen.has(warning.id)) {
      continue;
    }

    seen.add(warning.id);
    target.push(warning);
  }
}

function dedupeWarnings(warnings: readonly Warning[]): Warning[] {
  const deduped: Warning[] = [];

  addWarnings(deduped, warnings);

  return deduped;
}
