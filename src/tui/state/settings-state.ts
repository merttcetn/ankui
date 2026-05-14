export interface SettingsState {
  cursor: number;
  addMode: boolean;
  addBuffer: string;
}

export type SettingsAction =
  | { type: "moveCursor"; direction: "up" | "down"; rootCount: number }
  | { type: "enterAddMode" }
  | { type: "setAddBuffer"; value: string }
  | { type: "cancelAddMode" }
  | { type: "removeAtCursor"; newRootCount: number };

export const INITIAL_SETTINGS_STATE: SettingsState = {
  cursor: 0,
  addMode: false,
  addBuffer: ""
};

export function settingsReducer(
  state: SettingsState,
  action: SettingsAction
): SettingsState {
  switch (action.type) {
    case "moveCursor": {
      if (action.rootCount === 0) return { ...state, cursor: 0 };
      const max = action.rootCount - 1;
      const step = action.direction === "down" ? 1 : -1;
      const next = Math.max(0, Math.min(max, state.cursor + step));
      return { ...state, cursor: next };
    }
    case "enterAddMode":
      return { ...state, addMode: true, addBuffer: "" };
    case "setAddBuffer":
      return { ...state, addBuffer: action.value };
    case "cancelAddMode":
      return { ...state, addMode: false, addBuffer: "" };
    case "removeAtCursor": {
      const max = Math.max(0, action.newRootCount - 1);
      return { ...state, cursor: Math.min(state.cursor, max) };
    }
    default:
      return state;
  }
}
