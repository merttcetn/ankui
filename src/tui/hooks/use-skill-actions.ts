/**
 * Skill enable/disable action handlers.
 *
 * The staging + save flow for the Actions tab and Bundles tab. Staged changes
 * are kept UI-side (`pending`) until `[s]` triggers `savePending`, which
 * serially applies each change through the skill writer, updates the scan
 * model in-place, and records session actions for the exit summary.
 *
 * `toggleActionGroupAtCursor` collapses/expands an agent's group on the
 * Actions tab. `stagePending` toggles a single skill; `stageBundlePending`
 * toggles every markdown skill in a bundle at once. All three feed the same
 * `pending` queue, so `[s]` saves across both tabs uniformly.
 */

import os from "node:os";
import type { Dispatch } from "react";
import type { MultiProjectScanResult, ToolId } from "../../types.js";
import type { SessionAction } from "../../utils/session-summary.js";
import {
  disableSkill,
  enableSkill,
  type SkillWriterResult
} from "../../writer/index.js";
import type { BundleRegistry } from "../../bundles/registry.js";
import type { DetectedBundle } from "../../bundles/detect.js";
import type {
  PendingChange,
  SkillActionFeedback
} from "../screens/ActionsTab.js";
import type { TuiAction } from "../state/tui-state.js";
import {
  actionItemAt,
  applySkillActionResult,
  formatSkillActionFailure,
  formatSkillActionUnexpectedFailure,
  resolveActionSkill,
  setCurrentResult
} from "../util/skill-action.js";
import { collectSkillsForBundle } from "../util/bundle-counts.js";

export interface UseSkillActionsArgs {
  dispatch: Dispatch<TuiAction>;
  resultRef: React.MutableRefObject<MultiProjectScanResult>;
  actionsCollapsedRef: React.MutableRefObject<ToolId[]>;
  pendingRef: React.MutableRefObject<PendingChange[]>;
  listCursorRef: React.MutableRefObject<number>;
  confirmQuitRef: React.MutableRefObject<boolean>;
  savingRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  sessionActionsRef: React.MutableRefObject<SessionAction[]>;
  skillActionQueueRef: React.MutableRefObject<Promise<void>>;
  setPendingState: (next: PendingChange[]) => void;
  setActionFeedback: (next: SkillActionFeedback | null) => void;
  setSaving: (next: boolean) => void;
  setSaveSummary: (next: string | null) => void;
  setSessionActions: (next: SessionAction[]) => void;
  bundleRegistry: BundleRegistry;
  detectedBundles: DetectedBundle[];
  homeDir?: string;
  onExit?: (actions: ReadonlyArray<SessionAction>) => void;
  onRefresh?: () => Promise<void>;
  exit: () => void;
}

export interface SkillActions {
  toggleActionGroupAtCursor: () => void;
  stagePending: (action: "disable" | "enable") => void;
  stageBundlePending: (action: "disable" | "enable") => void;
  savePending: (opts?: { fromQuitConfirm?: boolean }) => void;
}

export function useSkillActions(args: UseSkillActionsArgs): SkillActions {
  const {
    dispatch,
    resultRef,
    actionsCollapsedRef,
    pendingRef,
    listCursorRef,
    confirmQuitRef,
    savingRef,
    mountedRef,
    sessionActionsRef,
    skillActionQueueRef,
    setPendingState,
    setActionFeedback,
    setSaving,
    setSaveSummary,
    setSessionActions,
    bundleRegistry,
    detectedBundles,
    homeDir,
    onExit,
    onRefresh,
    exit
  } = args;

  const toggleActionGroupAtCursor = (): void => {
    if (confirmQuitRef.current) return;
    const item = actionItemAt(
      resultRef.current,
      actionsCollapsedRef.current,
      pendingRef.current,
      listCursorRef.current
    );
    if (item?.type === "header") {
      dispatch({ type: "toggleActionsGroup", toolId: item.toolId });
    }
  };

  const stagePending = (action: "disable" | "enable"): void => {
    if (confirmQuitRef.current) return;
    const item = actionItemAt(
      resultRef.current,
      actionsCollapsedRef.current,
      pendingRef.current,
      listCursorRef.current
    );
    if (!item || item.type !== "skill") return;
    const skill = item.skill;

    const diskDisabled = skill.details?.disabled === true;
    const wantDisabled = action === "disable";
    const without = pendingRef.current.filter((p) => p.id !== skill.id);

    if (wantDisabled === diskDisabled) {
      // Toggled back to the on-disk state — no pending change to save.
      setPendingState(without);
      setActionFeedback({
        status: "noop",
        action,
        toolId: skill.toolId,
        kind: skill.kind,
        name: skill.name,
        message: `No change: ${skill.toolId}/${skill.name} already ${diskDisabled ? "disabled" : "enabled"}`
      });
    } else {
      setPendingState([
        ...without,
        {
          id: skill.id,
          toolId: skill.toolId,
          kind: skill.kind,
          name: skill.name,
          action
        }
      ]);
      setActionFeedback({
        status: "noop",
        action,
        toolId: skill.toolId,
        kind: skill.kind,
        name: skill.name,
        message: `Staged ${action}: ${skill.toolId}/${skill.name} — [s] to save`
      });
    }
    setSaveSummary(null);
  };

  /**
   * Stage all markdown skills belonging to the bundle under the Bundles-tab
   * cursor. Reuses the same `pending` queue + save flow as `stagePending` so
   * `[s]` works the same way; the Actions tab will see the staged changes too.
   */
  const stageBundlePending = (action: "disable" | "enable"): void => {
    if (confirmQuitRef.current) return;
    const cursor = listCursorRef.current;
    const tracked = bundleRegistry.bundles;
    let originName: string | null = null;
    if (cursor < tracked.length) {
      originName = tracked[cursor].name;
    } else {
      const detIdx = cursor - tracked.length;
      const det = detectedBundles[detIdx];
      if (det) originName = det.name;
    }
    if (!originName) return;

    const bundleSkills = collectSkillsForBundle(resultRef.current, originName);
    if (bundleSkills.length === 0) return;

    const wantDisabled = action === "disable";
    let stagedCount = 0;
    let next: PendingChange[] = pendingRef.current.filter((p) => {
      const stillMatches = bundleSkills.some((s) => s.id === p.id);
      return !stillMatches;
    });
    for (const skill of bundleSkills) {
      const diskDisabled = skill.details?.disabled === true;
      if (wantDisabled === diskDisabled) continue; // already in desired state
      next = [
        ...next,
        {
          id: skill.id,
          toolId: skill.toolId,
          kind: skill.kind,
          name: skill.name,
          action
        }
      ];
      stagedCount += 1;
    }
    setPendingState(next);
    setActionFeedback({
      status: "noop",
      action,
      toolId: bundleSkills[0].toolId,
      kind: bundleSkills[0].kind,
      name: originName,
      message:
        stagedCount === 0
          ? `No change: ${originName} already ${wantDisabled ? "disabled" : "enabled"}`
          : `Staged ${action} for ${stagedCount} skill${stagedCount === 1 ? "" : "s"} in ${originName} — [s] to save`
    });
    setSaveSummary(null);
  };

  const runSave = async (opts?: { fromQuitConfirm?: boolean }): Promise<void> => {
    savingRef.current = true;
    setSaving(true);
    setActionFeedback(null);

    const items = [...pendingRef.current];
    let saved = 0;
    const errors: string[] = [];

    for (const item of items) {
      const target = resolveActionSkill(resultRef.current, item);
      if (!target) {
        setPendingState(pendingRef.current.filter((p) => p.id !== item.id));
        continue;
      }
      const diskDisabled = target.details?.disabled === true;
      const wantDisabled = item.action === "disable";
      if (wantDisabled === diskDisabled) {
        // Already in the desired state on disk — nothing to write.
        setPendingState(pendingRef.current.filter((p) => p.id !== item.id));
        continue;
      }

      const context = {
        homeDir: homeDir ?? os.homedir(),
        cwd: resultRef.current.cwd
      };
      const op = item.action === "disable" ? disableSkill : enableSkill;
      let writerResult: SkillWriterResult;
      try {
        writerResult = await op(target, context);
      } catch {
        errors.push(formatSkillActionUnexpectedFailure(item.action, target));
        continue;
      }
      if (!writerResult.ok) {
        errors.push(formatSkillActionFailure(item.action, target, writerResult.reason));
        continue;
      }

      if (!mountedRef.current) return;
      setCurrentResult(
        dispatch,
        resultRef,
        applySkillActionResult(resultRef.current, target, item.action, writerResult.newSourcePath)
      );
      const nextActions = [
        ...sessionActionsRef.current,
        { toolId: target.toolId, name: target.name, action: item.action }
      ];
      sessionActionsRef.current = nextActions;
      setSessionActions(nextActions);
      setPendingState(pendingRef.current.filter((p) => p.id !== item.id));
      saved += 1;
    }

    if (!mountedRef.current) return;
    savingRef.current = false;
    setSaving(false);
    const failed = errors.length;
    setSaveSummary(
      `Saved ${saved}` +
        (failed
          ? ` · ${failed} failed: ${errors[0]}${failed > 1 ? ` (+${failed - 1} more)` : ""}`
          : "")
    );
    if (onRefresh && saved > 0) {
      await onRefresh();
    }
    if (opts?.fromQuitConfirm && pendingRef.current.length === 0) {
      if (onExit) onExit(sessionActionsRef.current);
      exit();
    }
  };

  const savePending = (opts?: { fromQuitConfirm?: boolean }): void => {
    if (savingRef.current) return;
    if (pendingRef.current.length === 0) {
      setSaveSummary("Nothing to save");
      if (opts?.fromQuitConfirm) {
        if (onExit) onExit(sessionActionsRef.current);
        exit();
      }
      return;
    }
    const queued = skillActionQueueRef.current.then(() => runSave(opts));
    skillActionQueueRef.current = queued.catch(() => undefined);
  };

  return {
    toggleActionGroupAtCursor,
    stagePending,
    stageBundlePending,
    savePending
  };
}
