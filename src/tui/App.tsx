import React from "react";
import { Box, Text, useApp } from "ink";

import {
  type MultiProjectScanResult
} from "../types.js";
import type { SessionAction } from "../utils/session-summary.js";
import type {
  CrawlOptions,
  CrawlResult
} from "../scanner/filesystem-crawler.js";
import { IdleWhisper } from "./components/IdleWhisper.js";
import { ShellWithHints } from "./components/ShellWithHints.js";
import { Sidebar } from "./components/Sidebar.js";
import { useIdleWhisper } from "./hooks/use-idle-whisper.js";
import { useScanSession } from "./hooks/use-scan-session.js";
import { useSkillActions } from "./hooks/use-skill-actions.js";
import { useNavigationKeys } from "./hooks/use-navigation-keys.js";
import { type TabId } from "./state/tui-state.js";
import { deriveKeyHints, FIRST_RUN_KEY_HINTS } from "./util/key-hints.js";
import { buildTabList } from "./util/tab-list.js";
import { renderScreen } from "./screens/render-screen.js";
import { computeBundleCounts } from "./util/bundle-counts.js";

import { detectBundlesFromScan, type DetectedBundle } from "../bundles/detect.js";
import { FirstRunScan } from "./screens/FirstRunScan.js";

export type AppMode = "firstRun" | "main";

export interface DataSource {
  initial: MultiProjectScanResult;
  subscribe?: (cb: (next: MultiProjectScanResult) => void) => () => void;
}

export type AppProps =
  | {
      mode?: "main";
      result: MultiProjectScanResult;
      dataSource?: never;
      homeDir?: string;
      onConfigChange?: (devRoots: string[]) => Promise<void>;
      crawlImplForFirstRun?: (options: CrawlOptions) => Promise<CrawlResult>;
      onRefresh?: () => Promise<void>;
      onExit?: (actions: ReadonlyArray<SessionAction>) => void;
    }
  | {
      mode?: "main";
      dataSource: DataSource;
      result?: never;
      homeDir?: string;
      onConfigChange?: (devRoots: string[]) => Promise<void>;
      crawlImplForFirstRun?: (options: CrawlOptions) => Promise<CrawlResult>;
      onRefresh?: () => Promise<void>;
      onExit?: (actions: ReadonlyArray<SessionAction>) => void;
    }
  | {
      mode: "firstRun";
      result?: null;
      dataSource?: never;
      homeDir: string;
      onConfigChange: (devRoots: string[]) => Promise<void>;
      crawlImplForFirstRun?: (options: CrawlOptions) => Promise<CrawlResult>;
    };

export function App(props: AppProps): React.ReactElement {
  if (props.mode === "firstRun") {
    return <FirstRunShell {...props} />;
  }

  return <MainShell {...(props)} />;
}

function FirstRunShell(props: Extract<AppProps, { mode: "firstRun" }>): React.ReactElement {
  const { exit } = useApp();

  return (
    <ShellWithHints hints={FIRST_RUN_KEY_HINTS}>
      <FirstRunScan
        mode="firstRun"
        homeDir={props.homeDir}
        onConfirm={(roots) => {
          void props.onConfigChange(roots).then(() => exit());
        }}
        onCancel={() => {
          exit();
        }}
        crawlImpl={props.crawlImplForFirstRun}
      />
    </ShellWithHints>
  );
}

interface MainShellProps {
  result?: MultiProjectScanResult;
  dataSource?: DataSource;
  homeDir?: string;
  onConfigChange?: (devRoots: string[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onExit?: (actions: ReadonlyArray<SessionAction>) => void;
}

function MainShell(props: MainShellProps): React.ReactElement {
  const initialResult = props.dataSource ? props.dataSource.initial : (props.result as MultiProjectScanResult);
  const {
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
    saving,
    setSaving,
    saveSummary,
    setSaveSummary,
    confirmQuit,
    setConfirmQuit,
    bundleRegistry,
    setPendingState
  } = useScanSession({
    initialResult,
    homeDir: props.homeDir,
    result: props.result,
    dataSource: props.dataSource
  });
  const { exit } = useApp();
  const { whisper, bump } = useIdleWhisper({ enabled: true });

  // Detected bundles + per-bundle live skill counts for the Bundles tab.
  // Recomputed every render (cheap — pure map over already-loaded scan).
  const trackedNames = new Set(bundleRegistry.bundles.map((b) => b.name));
  const detectedBundles: DetectedBundle[] = detectBundlesFromScan(result, trackedNames);
  const bundleCounts = computeBundleCounts(result, bundleRegistry, detectedBundles, pending);
  const bundleRowCount = bundleRegistry.bundles.length + detectedBundles.length;

  const { tools, crossTool } = buildTabList(result);
  // Flattened cycle order: tools row, then cross-tool row. Matches the
  // visual top-to-bottom, left-to-right reading of the two-row tab bar.
  const tabIds: TabId[] = [
    ...tools.map((t) => t.id as TabId),
    ...crossTool.map((t) => t.id as TabId)
  ];

  const {
    toggleActionGroupAtCursor,
    stagePending,
    stageBundlePending,
    savePending
  } = useSkillActions({
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
    homeDir: props.homeDir,
    onExit: props.onExit,
    onRefresh: props.onRefresh,
    exit
  });

  useNavigationKeys({
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
    onExit: props.onExit,
    onRefresh: props.onRefresh,
    exit
  });

  return (
    <ShellWithHints
      hints={deriveKeyHints(state, { canRefresh: Boolean(props.onRefresh) })}
    >
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Sidebar
            sections={[
              { label: "TOOLS", items: tools },
              { label: "VIEWS", items: crossTool }
            ]}
            activeId={state.activeTab}
            focus={state.focus}
          />
          <Box flexDirection="column" flexGrow={1} paddingLeft={2}>
            {renderScreen(
              state,
              result,
              dispatch,
              props.onConfigChange,
              sessionActions,
              actionFeedback,
              pending,
              saving,
              saveSummary,
              bundleRegistry,
              detectedBundles,
              bundleCounts
            )}
          </Box>
        </Box>
        {confirmQuit && (
          <Box marginTop={1}>
            <Text color="yellow">
              {`${pending.length} unsaved change(s) · [s] save · [q] discard & quit · [esc] cancel`}
            </Text>
          </Box>
        )}
        <IdleWhisper whisper={whisper} />
      </Box>
    </ShellWithHints>
  );
}
