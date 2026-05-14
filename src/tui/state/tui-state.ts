import type { MultiProjectScanResult, ToolId } from "../../types.js";
import { cycleTabId } from "./navigation.js";

export type TabId = "overview" | ToolId | "mcps" | "access" | "doctor" | "settings";

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
}

export type TuiAction =
  | { type: "setTab"; id: TabId }
  | { type: "drillIn"; frame: DrillFrame }
  | { type: "drillOut" }
  | { type: "cycleTab"; direction: "next" | "prev"; tabs: ReadonlyArray<TabId> }
  | { type: "setResult"; result: MultiProjectScanResult }
  | { type: "reset" };

export function createInitialState(result: MultiProjectScanResult): TuiState {
  return {
    activeTab: "overview",
    drillStack: [],
    result
  };
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "setTab":
      return { ...state, activeTab: action.id, drillStack: [] };
    case "drillIn":
      return { ...state, drillStack: [...state.drillStack, action.frame] };
    case "drillOut":
      if (state.drillStack.length === 0) return state;
      return { ...state, drillStack: state.drillStack.slice(0, -1) };
    case "cycleTab": {
      const nextId = cycleTabId(state.activeTab, action.direction, action.tabs) as TabId;
      return { ...state, activeTab: nextId, drillStack: [] };
    }
    case "setResult": {
      const trimmed = state.drillStack.filter((frame) => {
        if (frame.kind === "userScope") return true;
        return action.result.projects.some((p) => p.projectPath === frame.projectPath);
      });
      return {
        ...state,
        result: action.result,
        drillStack: trimmed
      };
    }
    case "reset":
      return createInitialState(state.result);
    default:
      return state;
  }
}
