import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { cycleTabId } from "./navigation.js";

export type TabId = "overview" | ToolId | "changes" | "mcps" | "access" | "doctor" | "actions" | "bundles" | "settings";

export type FocusPane = "sidebar" | "panel";

export type DrillFrame =
  | { kind: "userScope"; toolId: ToolId }
  | { kind: "project"; toolId: ToolId; projectPath: string };

export interface TuiState {
  activeTab: TabId;
  drillStack: DrillFrame[];
  /**
   * The current scan result. Phase 10 (watch mode) replaces this in-place on
   * filesystem change events; Settings (Phase 8f) reads `result.devRoots` and
   * `result.scannedAt` directly.
   */
  result: MultiProjectScanResult;
  /** Phase 8g: true while the `/`-key search overlay is open. */
  searchOpen: boolean;
  /** Phase 8g: current incremental search query (lowercased compare done by consumers). */
  searchQuery: string;
  /** Cursor for bounded drill-in skill lists. */
  listCursor: number;
  /**
   * Actions tab: agent groups the user has collapsed. Array (not a Set) to keep
   * state plain/serializable; read sites build a `Set` on demand. Empty = all
   * groups expanded. Survives rescans (it's a UI preference, not scan data).
   */
  actionsCollapsed: ToolId[];
  /**
   * Which pane currently owns ↑/↓. "sidebar" => arrows move the sidebar
   * selection; "panel" => arrows scroll the active screen's internal list.
   * Tab-changing actions reset this to "panel" so users land already
   * interacting with the screen they navigated to.
   */
  focus: FocusPane;
}

export type TuiAction =
  | { type: "setTab"; id: TabId }
  | { type: "drillIn"; frame: DrillFrame }
  | { type: "drillOut" }
  | { type: "cycleTab"; direction: "next" | "prev"; tabs: ReadonlyArray<TabId> }
  | { type: "setResult"; result: MultiProjectScanResult }
  | { type: "reset" }
  | { type: "searchOpen" }
  | { type: "searchClose" }
  | { type: "searchSetQuery"; query: string }
  | { type: "listMove"; direction: "up" | "down"; max: number }
  | { type: "toggleActionsGroup"; toolId: ToolId }
  | { type: "setFocus"; focus: FocusPane };

export function createInitialState(result: MultiProjectScanResult): TuiState {
  return {
    activeTab: "overview",
    drillStack: [],
    result,
    searchOpen: false,
    searchQuery: "",
    listCursor: 0,
    actionsCollapsed: [],
    focus: "sidebar"
  };
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "setTab":
      return {
        ...state,
        activeTab: action.id,
        drillStack: [],
        searchOpen: false,
        searchQuery: "",
        listCursor: 0,
        focus: "panel"
      };
    case "drillIn":
      return {
        ...state,
        drillStack: [...state.drillStack, action.frame],
        listCursor: 0,
        focus: "panel"
      };
    case "drillOut":
      if (state.drillStack.length === 0) return state;
      return {
        ...state,
        drillStack: state.drillStack.slice(0, -1),
        listCursor: 0
      };
    // cycleTab is mechanical sidebar navigation (driven by cycleSidebar()) —
    // focus stays where it was. setTab / drillIn are active user actions
    // that move focus into the panel.
    case "cycleTab": {
      const nextId = cycleTabId(state.activeTab, action.direction, action.tabs) as TabId;
      return {
        ...state,
        activeTab: nextId,
        drillStack: [],
        searchOpen: false,
        searchQuery: "",
        listCursor: 0
      };
    }
    case "setResult": {
      const trimmed = state.drillStack.filter((frame) => {
        if (frame.kind === "userScope") return true;
        return action.result.projects.some((p) => p.projectPath === frame.projectPath);
      });
      return {
        ...state,
        result: action.result,
        drillStack: trimmed,
        listCursor: clampCursor(state.listCursor, Number.POSITIVE_INFINITY)
      };
    }
    case "reset":
      return createInitialState(state.result);
    case "searchOpen":
      return { ...state, searchOpen: true, searchQuery: "", listCursor: 0 };
    case "searchClose":
      return { ...state, searchOpen: false, searchQuery: "", listCursor: 0 };
    case "searchSetQuery":
      return { ...state, searchQuery: action.query, listCursor: 0 };
    case "listMove": {
      const max = Math.max(0, action.max);
      const step = action.direction === "down" ? 1 : -1;
      return {
        ...state,
        listCursor: clampCursor(state.listCursor + step, max)
      };
    }
    case "toggleActionsGroup": {
      const collapsed = state.actionsCollapsed.includes(action.toolId)
        ? state.actionsCollapsed.filter((id) => id !== action.toolId)
        : [...state.actionsCollapsed, action.toolId];
      // Cursor is intentionally left as-is; a collapse that hides the current
      // row is clamped at render time and permanently re-clamped on the next
      // arrow press via getListMax + listMove.
      return { ...state, actionsCollapsed: collapsed };
    }
    case "setFocus":
      return { ...state, focus: action.focus };
    default:
      return state;
  }
}

function clampCursor(cursor: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(max - 1, cursor));
}
