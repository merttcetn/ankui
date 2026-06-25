/**
 * List-cursor bounds helpers.
 *
 * Resolves the max index for the shared `listCursor` based on what the current
 * screen is scrolling through. Drill-in screens scroll skills; the Access tab
 * scrolls flattened findings; the Actions tab navigates headers+skills; the
 * Bundles tab navigates registry + detected rows. Everything else returns 0,
 * which short-circuits arrow handling.
 */

import type { MultiProjectScanResult } from "../../types.js";
import type { TuiState } from "../state/tui-state.js";
import { filterSkillsByQuery } from "./skill-filter.js";
import { aggregateFindings } from "./finding-grouping.js";
import { actionsNavigableCount } from "./actions-items.js";

export function getDrillSkillCount(
  state: TuiState,
  result: MultiProjectScanResult
): number {
  const top = state.drillStack[state.drillStack.length - 1];
  if (!top) return 0;

  if (top.kind === "userScope") {
    const tool = result.userScope.tools.find((t) => t.id === top.toolId);
    return filterSkillsByQuery(tool?.skills ?? [], state.searchQuery).length;
  }

  const project = result.projects.find((p) => p.projectPath === top.projectPath);
  const tool = project?.scan.tools.find((t) => t.id === top.toolId);
  return tool?.skills.length ?? 0;
}

export function getListMax(
  state: TuiState,
  result: MultiProjectScanResult,
  bundleRowCount: number
): number {
  if (state.drillStack.length > 0) return getDrillSkillCount(state, result);
  if (state.activeTab === "access") {
    return aggregateFindings(result).reduce((n, s) => n + s.findings.length, 0);
  }
  if (state.activeTab === "actions") {
    return actionsNavigableCount(result, new Set(state.actionsCollapsed));
  }
  if (state.activeTab === "bundles") {
    return bundleRowCount;
  }
  return 0;
}
