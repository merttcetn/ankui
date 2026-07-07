/**
 * Active-screen render switch.
 *
 * Resolves the current drill-in frame or active tab to its screen component.
 * Keeps App.tsx free of per-screen imports and lets screens change without
 * touching the shell wiring.
 */

import type React from "react";
import type { MultiProjectScanResult } from "../../types.js";
import type { TuiAction, TuiState } from "../state/tui-state.js";
import type { BundleRegistry } from "../../bundles/registry.js";
import type { DetectedBundle } from "../../bundles/detect.js";
import type { BundleRowCounts } from "./BundlesScreen.js";
import type {
  PendingChange,
  SkillActionFeedback
} from "./ActionsTab.js";
import type { SessionAction } from "../../utils/session-summary.js";

import { Overview } from "./Overview.js";
import { ToolTab } from "./ToolTab.js";
import { UserScopeDrillIn } from "./UserScopeDrillIn.js";
import { ProjectDrillIn } from "./ProjectDrillIn.js";
import { McpsTab } from "./McpsTab.js";
import { AccessTab } from "./AccessTab.js";
import { DoctorTab } from "./DoctorTab.js";
import { BundlesScreen } from "./BundlesScreen.js";
import { Settings } from "./Settings.js";
import { ActionsTab } from "./ActionsTab.js";
import { ChangesTab } from "./ChangesTab.js";

export function renderScreen(
  state: TuiState,
  result: MultiProjectScanResult,
  dispatch: React.Dispatch<TuiAction>,
  onConfigChange: ((devRoots: string[]) => Promise<void>) | undefined,
  sessionActions: ReadonlyArray<SessionAction>,
  actionFeedback: SkillActionFeedback | null,
  pendingChanges: ReadonlyArray<PendingChange>,
  saving: boolean,
  saveSummary: string | null,
  bundleRegistry: BundleRegistry,
  detectedBundles: DetectedBundle[],
  bundleCounts: Map<string, BundleRowCounts>
): React.ReactElement {
  if (state.drillStack.length > 0) {
    const top = state.drillStack[state.drillStack.length - 1];
    if (top.kind === "userScope") {
      return (
        <UserScopeDrillIn
          toolId={top.toolId}
          result={result}
          cursor={state.listCursor}
          searchOpen={state.searchOpen}
          searchQuery={state.searchQuery}
        />
      );
    }
    return (
      <ProjectDrillIn
        toolId={top.toolId}
        projectPath={top.projectPath}
        result={result}
        cursor={state.listCursor}
      />
    );
  }
  switch (state.activeTab) {
    case "overview":
      return <Overview result={result} />;
    case "changes":
      return (
        <ChangesTab
          result={result}
          active={state.focus === "panel"}
          onResult={(next) => dispatch({ type: "setResult", result: next })}
        />
      );
    case "mcps":
      return <McpsTab result={result} />;
    case "access":
      return <AccessTab result={result} cursor={state.listCursor} />;
    case "doctor":
      return <DoctorTab result={result} />;
    case "actions":
      return (
        <ActionsTab
          result={result}
          cursor={state.listCursor}
          sessionActions={sessionActions}
          actionFeedback={actionFeedback}
          pending={pendingChanges}
          saving={saving}
          saveSummary={saveSummary}
          collapsed={state.actionsCollapsed}
        />
      );
    case "bundles":
      return (
        <BundlesScreen
          registry={bundleRegistry}
          detected={detectedBundles}
          cursor={state.listCursor}
          counts={bundleCounts}
        />
      );
    case "settings":
      return (
        <Settings
          result={result}
          onConfigChange={
            onConfigChange ??
            (async () => {
              // 8f keeps Settings purely presentational when no callback was
              // wired. The CLI always provides one in production.
            })
          }
          onRescan={() => {
            // 8f keeps re-scan as a placeholder: dispatch back to overview so
            // the parent's onConfigChange path can re-render. Inline re-scan
            // UI is Phase 8g.
            dispatch({ type: "setTab", id: "overview" });
          }}
        />
      );
    default:
      return <ToolTab toolId={state.activeTab} result={result} dispatch={dispatch} />;
  }
}
