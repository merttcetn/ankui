/**
 * Scan/session state orchestration.
 *
 * Owns the TUI reducer plus the mount-time effects that keep it in sync with
 * the outside world: the bundle registry load, watch-mode subscription, and
 * prop-driven result replacement. Also owns the pending-change staging state
 * (kept UI-side until [s] saves) and its `setPendingState` helper that keeps
 * the pending ref and the confirm-quit flag coherent.
 *
 * Returns the reducer output plus every ref/setter the rest of the shell
 * (handlers, key wiring, render) needs. Keeping all of this in one hook lets
 * MainShell stay a thin composition of `useScanSession` + `useSkillActions` +
 * `useNavigationKeys`.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import type React from "react";
import type { MultiProjectScanResult, ToolId } from "../../types.js";
import type { SessionAction } from "../../utils/session-summary.js";
import {
  createInitialState,
  tuiReducer,
  type TuiAction,
  type TuiState
} from "../state/tui-state.js";
import { readRegistry, type BundleRegistry } from "../../bundles/registry.js";
import { setCurrentResult } from "../util/skill-action.js";
import type {
  PendingChange,
  SkillActionFeedback
} from "../screens/ActionsTab.js";

export interface UseScanSessionArgs {
  initialResult: MultiProjectScanResult;
  /** Explicit homeDir prop (tests pass this). */
  homeDir?: string;
  /** Result prop, if any — replaces state when it changes identity. */
  result?: MultiProjectScanResult;
  /** Watch-mode data source, if any. */
  dataSource?: {
    initial: MultiProjectScanResult;
    subscribe?: (cb: (next: MultiProjectScanResult) => void) => () => void;
  };
}

export interface ScanSession {
  state: TuiState;
  dispatch: React.Dispatch<TuiAction>;
  /** Current result, ref-synced every render so handlers see the latest. */
  result: MultiProjectScanResult;
  resultRef: React.MutableRefObject<MultiProjectScanResult>;
  listCursorRef: React.MutableRefObject<number>;
  actionsCollapsedRef: React.MutableRefObject<ToolId[]>;
  pendingRef: React.MutableRefObject<PendingChange[]>;
  confirmQuitRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  savingRef: React.MutableRefObject<boolean>;
  sessionActionsRef: React.MutableRefObject<SessionAction[]>;
  skillActionQueueRef: React.MutableRefObject<Promise<void>>;
  sessionActions: SessionAction[];
  setSessionActions: (next: SessionAction[]) => void;
  actionFeedback: SkillActionFeedback | null;
  setActionFeedback: (next: SkillActionFeedback | null) => void;
  pending: PendingChange[];
  setPending: (next: PendingChange[]) => void;
  saving: boolean;
  setSaving: (next: boolean) => void;
  saveSummary: string | null;
  setSaveSummary: (next: string | null) => void;
  confirmQuit: boolean;
  setConfirmQuit: (next: boolean) => void;
  bundleRegistry: BundleRegistry;
  setBundleRegistry: (next: BundleRegistry) => void;
  /** Sets pending and clears confirm-quit when staging drains to empty. */
  setPendingState: (next: PendingChange[]) => void;
}

export function useScanSession(args: UseScanSessionArgs): ScanSession {
  const { initialResult, homeDir, result: resultProp, dataSource } = args;
  const [state, dispatch] = useReducer(tuiReducer, initialResult, createInitialState);

  const sessionActionsRef = useRef<SessionAction[]>([]);
  const resultRef = useRef<MultiProjectScanResult>(initialResult);
  const listCursorRef = useRef(0);
  const actionsCollapsedRef = useRef<ToolId[]>([]);
  const skillActionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const [sessionActions, setSessionActions] = useState<SessionAction[]>([]);
  const [actionFeedback, setActionFeedback] = useState<SkillActionFeedback | null>(null);
  // Staged disable/enable: kept UI-side until [s]. `result` (on-disk truth) is
  // only mutated by a successful save, so skill ids stay stable while staging.
  const [pending, setPending] = useState<PendingChange[]>([]);
  const pendingRef = useRef<PendingChange[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const confirmQuitRef = useRef(false);
  // Phase 11a: registry powers the Bundles tab. Loaded once on mount (and again
  // after onRefresh, since both code paths re-run mount-time effects via props
  // changing). Failures leave the empty default in place.
  const [bundleRegistry, setBundleRegistry] = useState<BundleRegistry>({ version: 1, bundles: [] });

  const setPendingState = (next: PendingChange[]): void => {
    pendingRef.current = next;
    setPending(next);
    if (next.length === 0 && confirmQuitRef.current) {
      confirmQuitRef.current = false;
      setConfirmQuit(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Prefer the explicit homeDir prop (tests pass this), then fall back to the
  // homeDir embedded in the scan result. Without the fallback, the standard
  // renderTui/LauncherShell path renders <App result={...}> without the prop
  // and the Bundles tab would always show an empty registry.
  const resultHomeDir = resultProp?.homeDir ?? dataSource?.initial.homeDir;
  const effectiveHomeDir = homeDir ?? resultHomeDir;
  useEffect(() => {
    let cancelled = false;
    if (!effectiveHomeDir) return;
    readRegistry(effectiveHomeDir)
      .then((reg) => {
        if (!cancelled) setBundleRegistry(reg);
      })
      .catch(() => {
        /* leave default empty registry */
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveHomeDir]);

  useEffect(() => {
    if (!dataSource?.subscribe) return;
    const unsubscribe = dataSource.subscribe((next) => {
      setCurrentResult(dispatch, resultRef, next);
    });
    return unsubscribe;
  }, [dataSource]);

  useEffect(() => {
    if (!resultProp) return;
    if (resultProp === state.result) return;
    setCurrentResult(dispatch, resultRef, resultProp);
    // Only re-sync when the incoming resultProp changes; state.result is read
    // for comparison, not as a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultProp]);

  const result = state.result;
  resultRef.current = result;
  listCursorRef.current = state.listCursor;
  actionsCollapsedRef.current = state.actionsCollapsed;

  return {
    state,
    dispatch,
    result,
    resultRef,
    listCursorRef,
    actionsCollapsedRef,
    pendingRef,
    confirmQuitRef,
    mountedRef,
    savingRef,
    sessionActionsRef,
    skillActionQueueRef,
    sessionActions,
    setSessionActions,
    actionFeedback,
    setActionFeedback,
    pending,
    setPending,
    saving,
    setSaving,
    saveSummary,
    setSaveSummary,
    confirmQuit,
    setConfirmQuit,
    bundleRegistry,
    setBundleRegistry,
    setPendingState
  };
}
