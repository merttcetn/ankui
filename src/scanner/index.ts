import os from "node:os";

import {
  createAllEmptyTools,
  createScanSummary,
  type AITool,
  type ScanResult
} from "../types.js";
import { discover } from "./discovery.js";

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

  return {
    scannedAt: (options.now ?? new Date()).toISOString(),
    cwd,
    homeDir,
    tools,
    findings: [],
    warnings: discovery.warnings,
    summary: createScanSummary(tools)
  };
}

function findTool(tools: AITool[], toolId: AITool["id"]): AITool | undefined {
  return tools.find((tool) => tool.id === toolId);
}
