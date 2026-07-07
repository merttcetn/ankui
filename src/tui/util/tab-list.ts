/**
 * Tab-bar construction.
 *
 * Builds the two rows of sidebar tabs (TOOLS + VIEWS) and the cycle order
 * derived from them. `isToolTab` decides whether Enter on a sidebar row
 * drills in or merely shifts focus.
 */

import type { MultiProjectScanResult, ToolId } from "../../types.js";
import type { TabId } from "../state/tui-state.js";
import type { TabItem } from "../components/Sidebar.js";

export const CROSS_TOOL_TABS: ReadonlyArray<TabItem> = [
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" },
  { id: "actions", label: "Actions" },
  { id: "bundles", label: "Bundles" },
  { id: "settings", label: "Settings" },
  { id: "changes", label: "Changes" }
];

/**
 * Tabs that have no user-scope drill-in. Includes "overview" (a tool-row
 * tab that isn't tied to a single tool) and every cross-tool tab. Used by
 * onEnter to decide whether Enter drills in or merely shifts focus.
 */
export const NON_DRILLABLE_TAB_IDS: ReadonlySet<TabId> = new Set<TabId>([
  "overview",
  "changes",
  "mcps",
  "access",
  "doctor",
  "actions",
  "bundles",
  "settings"
]);

export function isToolTab(id: TabId): id is ToolId {
  return !NON_DRILLABLE_TAB_IDS.has(id);
}

export interface TabRows {
  tools: TabItem[];
  crossTool: ReadonlyArray<TabItem>;
}

export function buildTabList(result: MultiProjectScanResult): TabRows {
  const tools: TabItem[] = [{ id: "overview", label: "Overview" }];
  for (const tool of result.userScope.tools) {
    tools.push({ id: tool.id, label: tool.name });
  }
  return { tools, crossTool: CROSS_TOOL_TABS };
}
