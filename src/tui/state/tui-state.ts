import type { ToolId } from "../../types.js";
import { cycleTabId } from "./navigation.js";

export type TabId = "overview" | ToolId | "mcps" | "access" | "doctor" | "settings";

export type DrillFrame =
  | { kind: "userScope"; toolId: ToolId }
  | { kind: "project"; toolId: ToolId; projectPath: string };

export interface TuiState {
  activeTab: TabId;
  drillStack: DrillFrame[];
}

export type TuiAction =
  | { type: "setTab"; id: TabId }
  | { type: "drillIn"; frame: DrillFrame }
  | { type: "drillOut" }
  | { type: "cycleTab"; direction: "next" | "prev"; tabs: ReadonlyArray<TabId> }
  | { type: "reset" };

export const INITIAL_STATE: TuiState = {
  activeTab: "overview",
  drillStack: []
};

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "setTab":
      return { activeTab: action.id, drillStack: [] };
    case "drillIn":
      return { ...state, drillStack: [...state.drillStack, action.frame] };
    case "drillOut":
      if (state.drillStack.length === 0) return state;
      return { ...state, drillStack: state.drillStack.slice(0, -1) };
    case "cycleTab": {
      const nextId = cycleTabId(state.activeTab, action.direction, action.tabs) as TabId;
      return { activeTab: nextId, drillStack: [] };
    }
    case "reset":
      return INITIAL_STATE;
    default:
      return state;
  }
}
