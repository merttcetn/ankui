import {
  createWarning,
  type Finding,
  type Skill,
  type ToolId,
  type Warning
} from "../../types.js";
import type { DiscoveredPath } from "../discovery.js";

export interface AdapterContext {
  cwd: string;
  homeDir: string;
  env: Record<string, string | undefined>;
  discoveredPaths: DiscoveredPath[];
  isIgnored?: (relativePath: string) => boolean;
}

export interface AdapterResult {
  skills: Skill[];
  warnings: Warning[];
  findings?: Finding[];
}

export interface ScannerAdapter {
  toolId: ToolId;
  scan(context: AdapterContext): Promise<AdapterResult>;
}

export interface AdapterRunContext {
  cwd: string;
  homeDir: string;
  env: Record<string, string | undefined>;
  discoveredPaths: DiscoveredPath[];
  isIgnored?: (relativePath: string) => boolean;
}

export interface AdapterRunResult {
  toolId: ToolId;
  skills: Skill[];
  findings: Finding[];
  warnings: Warning[];
}

export interface AdapterRunnerOptions {
  timeoutMs?: number;
}

const DEFAULT_ADAPTER_TIMEOUT_MS = 1000;

class AdapterTimeoutError extends Error {
  constructor(readonly toolId: ToolId, readonly timeoutMs: number) {
    super(`Adapter ${toolId} timed out after ${timeoutMs}ms`);
    this.name = "AdapterTimeoutError";
  }
}

export async function runScannerAdapters(
  adapters: readonly ScannerAdapter[],
  context: AdapterRunContext,
  options: AdapterRunnerOptions = {}
): Promise<AdapterRunResult[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS;
  const settledResults = await Promise.allSettled(
    adapters.map((adapter) => runSingleAdapter(adapter, context, timeoutMs))
  );

  return settledResults.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return createFailureResult(adapters[index].toolId, result.reason);
  });
}

async function runSingleAdapter(
  adapter: ScannerAdapter,
  context: AdapterRunContext,
  timeoutMs: number
): Promise<AdapterRunResult> {
  try {
    const result = await withTimeout(
      adapter.scan({
        cwd: context.cwd,
        homeDir: context.homeDir,
        env: context.env,
        discoveredPaths: context.discoveredPaths.filter(
          (discoveredPath) => discoveredPath.toolId === adapter.toolId
        ),
        isIgnored: context.isIgnored
      }),
      adapter.toolId,
      timeoutMs
    );

    return {
      toolId: adapter.toolId,
      skills: result.skills,
      findings: result.findings ?? [],
      warnings: result.warnings
    };
  } catch (error) {
    return createFailureResult(adapter.toolId, error);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  toolId: ToolId,
  timeoutMs: number
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new AdapterTimeoutError(toolId, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createFailureResult(toolId: ToolId, error: unknown): AdapterRunResult {
  return {
    toolId,
    skills: [],
    findings: [],
    warnings: [createAdapterWarning(toolId, error)]
  };
}

function createAdapterWarning(toolId: ToolId, error: unknown): Warning {
  if (error instanceof AdapterTimeoutError) {
    return createWarning({
      id: `warning:adapter-timeout:${toolId}`,
      reason: "adapter_timeout",
      message: `Skipped ${toolId} adapter results because scanning exceeded ${error.timeoutMs}ms.`
    });
  }

  return createWarning({
    id: `warning:adapter-failed:${toolId}`,
    reason: "unknown",
    message: `Skipped ${toolId} adapter results because the adapter failed: ${formatError(error)}`
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
