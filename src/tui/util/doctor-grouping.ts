import type {
  AITool,
  MultiProjectScanResult,
  ToolId,
  Warning
} from "../../types.js";
import { relativizeHome } from "../../utils/paths.js";

export interface DoctorToolRow {
  toolId: ToolId;
  name: string;
  detected: boolean;
  /** Detected paths outside `cwd`, rendered home-relative (`~/.claude`). */
  userPaths: ReadonlyArray<string>;
  /** Detected paths inside `cwd`, rendered cwd-relative (`./.claude`, `.`). */
  projectPaths: ReadonlyArray<string>;
}

export interface WarningGroup {
  reason: Warning["reason"];
  warnings: ReadonlyArray<Warning>;
}

/**
 * One row per tool — order matches `TOOL_DEFINITIONS`. Detected paths are
 * split into "user" (anything outside `cwd`, rendered home-relative) and
 * "project" (anything inside `cwd`, rendered cwd-relative as `./…` or `.`).
 *
 * Mirrors `formatDoctor`'s `classifyAndRelativize`.
 */
export function buildDoctorBoard(
  result: MultiProjectScanResult
): DoctorToolRow[] {
  const { cwd, homeDir } = result;
  return result.userScope.tools.map((tool) => classifyTool(tool, cwd, homeDir));
}

function classifyTool(tool: AITool, cwd: string, homeDir: string): DoctorToolRow {
  const userPaths: string[] = [];
  const projectPaths: string[] = [];

  if (tool.detected) {
    for (const filePath of tool.detectedPaths) {
      const classified = classifyAndRelativize(filePath, cwd, homeDir);
      if (classified.scope === "project") {
        projectPaths.push(classified.display);
      } else {
        userPaths.push(classified.display);
      }
    }
  }

  return {
    toolId: tool.id,
    name: tool.name,
    detected: tool.detected,
    userPaths,
    projectPaths
  };
}

function classifyAndRelativize(
  filePath: string,
  cwd: string,
  homeDir: string
): { scope: "user" | "project"; display: string } {
  if (cwd && (filePath === cwd || filePath.startsWith(cwd + "/"))) {
    const rel = filePath.slice(cwd.length);
    return { scope: "project", display: rel.length === 0 ? "." : `.${rel}` };
  }
  return { scope: "user", display: relativizeHome(filePath, homeDir) };
}

/**
 * Groups `result.warnings` (multi-project orchestration warnings) by reason.
 * Sorted by count desc, then reason asc — matches `formatDoctor`'s ordering.
 */
export function groupWarningsByReason(
  result: MultiProjectScanResult
): WarningGroup[] {
  if (result.warnings.length === 0) return [];

  const map = new Map<Warning["reason"], Warning[]>();
  for (const warning of result.warnings) {
    const list = map.get(warning.reason) ?? [];
    list.push(warning);
    map.set(warning.reason, list);
  }

  const groups: WarningGroup[] = [];
  for (const [reason, warnings] of map.entries()) {
    groups.push({ reason, warnings });
  }
  groups.sort((a, b) => {
    if (a.warnings.length !== b.warnings.length) {
      return b.warnings.length - a.warnings.length;
    }
    return a.reason.localeCompare(b.reason);
  });
  return groups;
}
