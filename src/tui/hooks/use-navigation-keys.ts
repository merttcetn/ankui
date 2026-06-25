/**
 * Navigation coordinator.
 *
 * Wires `useKeys` to the TUI reducer and the skill-action handlers. Owns the
 * sidebar cycle order (`tabIds`), arrow/focus semantics, drill-in on Enter,
 * search overlay, screen-scoped hotkeys (Actions/Bundles [d]/[e]/[s]), and
 * the quit-confirm flow. MainShell only needs to pass state + handlers in;
 * this hook does all the key-binding wiring.
 */

import type { Dispatch } from "react";
import type { MultiProjectScanResult } from "../../types.js";
import type { SessionAction } from "../../utils/session-summary.js";
import type { TuiAction, TuiState, TabId } from "../state/tui-state.js";
import { useKeys } from "../input/use-keys.js";
import { isToolTab } from "../util/tab-list.js";
import { getListMax } from "../util/list-bounds.js";
import type {
  PendingChange
} from "../screens/ActionsTab.js";

export interface UseNavigationKeysArgs {
  state: TuiState;
  dispatch: Dispatch<TuiAction>;
  result: MultiProjectScanResult;
  bundleRowCount: number;
  tabIds: TabId[];
  bump: () => void;
  pendingRef: React.MutableRefObject<PendingChange[]>;
  confirmQuitRef: React.MutableRefObject<boolean>;
  sessionActionsRef: React.MutableRefObject<SessionAction[]>;
  setConfirmQuit: (next: boolean) => void;
  toggleActionGroupAtCursor: () => void;
  stagePending: (action: "disable" | "enable") => void;
  stageBundlePending: (action: "disable" | "enable") => void;
  savePending: (opts?: { fromQuitConfirm?: boolean }) => void;
  onExit?: (actions: ReadonlyArray<SessionAction>) => void;
  onRefresh?: () => Promise<void>;
  exit: () => void;
}

export function useNavigationKeys(args: UseNavigationKeysArgs): void {
  const {
    state,
    dispatch,
    result,
    bundleRowCount,
    tabIds,
    bump,
    pendingRef,
    confirmQuitRef,
    sessionActionsRef,
    setConfirmQuit,
    toggleActionGroupAtCursor,
    stagePending,
    stageBundlePending,
    savePending,
    onExit,
    onRefresh,
    exit
  } = args;

  const cycleSidebar = (direction: "next" | "prev"): void => {
    dispatch({ type: "cycleTab", direction, tabs: tabIds });
  };

  useKeys({
    onArrowDown: () => {
      bump();
      if (state.focus === "sidebar" && state.drillStack.length === 0) {
        cycleSidebar("next");
        return;
      }
      const max = getListMax(state, result, bundleRowCount);
      if (max > 0) {
        dispatch({ type: "listMove", direction: "down", max });
      }
    },
    onArrowUp: () => {
      bump();
      if (state.focus === "sidebar" && state.drillStack.length === 0) {
        cycleSidebar("prev");
        return;
      }
      const max = getListMax(state, result, bundleRowCount);
      if (max > 0) {
        dispatch({ type: "listMove", direction: "up", max });
      }
    },
    onArrowRight: () => {
      bump();
      if (state.focus === "sidebar") {
        dispatch({ type: "setFocus", focus: "panel" });
      }
    },
    onArrowLeft: () => {
      bump();
      if (state.focus === "panel" && state.drillStack.length === 0 && !state.searchOpen) {
        dispatch({ type: "setFocus", focus: "sidebar" });
      }
    },
    onEnter: () => {
      bump();
      // Sidebar focus: Enter on a tool row drills in and hands focus to the
      // panel. On non-drillable rows we just shift focus to the panel.
      if (state.focus === "sidebar") {
        const tab = state.activeTab;
        if (!isToolTab(tab)) {
          dispatch({ type: "setFocus", focus: "panel" });
          return;
        }
        dispatch({
          type: "drillIn",
          frame: { kind: "userScope", toolId: tab }
        });
        // Belt-and-suspenders: drillIn's reducer also sets focus to "panel",
        // but pinning it here removes the invariant dependency.
        dispatch({ type: "setFocus", focus: "panel" });
        return;
      }

      // Panel focus: original drill-in semantics — only meaningful on tool tabs.
      if (state.drillStack.length > 0) return;
      const tab = state.activeTab;
      if (!isToolTab(tab)) return;
      dispatch({
        type: "drillIn",
        frame: { kind: "userScope", toolId: tab }
      });
    },
    onEscape: () => {
      bump();
      if (confirmQuitRef.current) {
        confirmQuitRef.current = false;
        setConfirmQuit(false);
        return;
      }
      if (state.searchOpen) {
        dispatch({ type: "searchClose" });
        return;
      }
      if (state.drillStack.length > 0) {
        dispatch({ type: "drillOut" });
        return;
      }
      if (state.focus === "panel") {
        dispatch({ type: "setFocus", focus: "sidebar" });
      }
    },
    onSlash: () => {
      bump();
      if (!state.searchOpen) {
        dispatch({ type: "searchOpen" });
        dispatch({ type: "setFocus", focus: "panel" });
      }
    },
    onTextInput: (ch) => {
      bump();
      if (state.searchOpen) {
        dispatch({ type: "searchSetQuery", query: state.searchQuery + ch });
        return;
      }
      // Quit-confirm swallows text input; only [s] (save) acts there.
      if (confirmQuitRef.current) {
        if (ch === "s" || ch === "S") savePending({ fromQuitConfirm: true });
        return;
      }
      // Screen-scoped hotkeys live here so search-overlay input always wins.
      // Gated on focus="panel" because key-hints only advertise them in that
      // mode — the sidebar-focused user shouldn't accidentally stage actions
      // by pressing d/e/s while browsing the navigator.
      if (state.activeTab === "actions" && state.focus === "panel") {
        if (ch === "d") stagePending("disable");
        else if (ch === "e") stagePending("enable");
        else if (ch === "s" || ch === "S") savePending();
        else if (ch === " ") toggleActionGroupAtCursor();
      }
      // Bundles tab: d/e stage all skills in the bundle under the cursor;
      // s saves. Mirrors the Actions tab keybindings — same pending queue.
      if (state.activeTab === "bundles" && state.focus === "panel") {
        if (ch === "d") stageBundlePending("disable");
        else if (ch === "e") stageBundlePending("enable");
        else if (ch === "s" || ch === "S") savePending();
      }
    },
    onBackspace: () => {
      bump();
      if (state.searchOpen && state.searchQuery.length > 0) {
        dispatch({
          type: "searchSetQuery",
          query: state.searchQuery.slice(0, -1)
        });
      }
    },
    onQuit: () => {
      bump();
      if (pendingRef.current.length > 0 && !confirmQuitRef.current) {
        confirmQuitRef.current = true;
        setConfirmQuit(true);
        return;
      }
      if (onExit) {
        onExit(sessionActionsRef.current);
      }
      exit();
    },
    onRefresh: () => {
      bump();
      if (!onRefresh) return;
      void onRefresh();
    }
  });
}
