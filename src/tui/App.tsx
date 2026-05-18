import React, { useEffect, useReducer } from "react";
import { Box, useApp } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import type {
  CrawlOptions,
  CrawlResult
} from "../scanner/filesystem-crawler.js";
import { Frame } from "./components/Frame.js";
import { IdleWhisper } from "./components/IdleWhisper.js";
import { TabBar, type TabItem } from "./components/TabBar.js";
import { useIdleWhisper } from "./hooks/use-idle-whisper.js";
import { useKeys } from "./input/use-keys.js";
import {
  createInitialState,
  tuiReducer,
  type TabId,
  type TuiAction,
  type TuiState
} from "./state/tui-state.js";
import { filterSkillsByQuery } from "./util/skill-filter.js";

import { Overview } from "./screens/Overview.js";
import { ToolTab } from "./screens/ToolTab.js";
import { UserScopeDrillIn } from "./screens/UserScopeDrillIn.js";
import { ProjectDrillIn } from "./screens/ProjectDrillIn.js";
import { McpsTab } from "./screens/McpsTab.js";
import { AccessTab } from "./screens/AccessTab.js";
import { DoctorTab } from "./screens/DoctorTab.js";
import { Settings } from "./screens/Settings.js";
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
    }
  | {
      mode?: "main";
      dataSource: DataSource;
      result?: never;
      homeDir?: string;
      onConfigChange?: (devRoots: string[]) => Promise<void>;
      crawlImplForFirstRun?: (options: CrawlOptions) => Promise<CrawlResult>;
    }
  | {
      mode: "firstRun";
      result?: null;
      dataSource?: never;
      homeDir: string;
      onConfigChange: (devRoots: string[]) => Promise<void>;
      crawlImplForFirstRun?: (options: CrawlOptions) => Promise<CrawlResult>;
    };

const CROSS_TOOL_TABS: ReadonlyArray<TabItem> = [
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" },
  { id: "settings", label: "Settings" }
];

export function App(props: AppProps): React.ReactElement {
  if (props.mode === "firstRun") {
    return <FirstRunShell {...props} />;
  }

  return <MainShell {...(props as MainShellProps)} />;
}

function FirstRunShell(props: Extract<AppProps, { mode: "firstRun" }>): React.ReactElement {
  const { exit } = useApp();

  return (
    <Frame>
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
    </Frame>
  );
}

interface MainShellProps {
  result?: MultiProjectScanResult;
  dataSource?: DataSource;
  homeDir?: string;
  onConfigChange?: (devRoots: string[]) => Promise<void>;
}

function MainShell(props: MainShellProps): React.ReactElement {
  const initialResult = props.dataSource ? props.dataSource.initial : (props.result as MultiProjectScanResult);
  const [state, dispatch] = useReducer(tuiReducer, initialResult, createInitialState);
  const { exit } = useApp();
  const { whisper, bump } = useIdleWhisper({ enabled: true });

  useEffect(() => {
    if (!props.dataSource?.subscribe) return;
    const unsubscribe = props.dataSource.subscribe((next) => {
      dispatch({ type: "setResult", result: next });
    });
    return unsubscribe;
  }, [props.dataSource]);

  const result = state.result;
  const { tools, crossTool } = buildTabList(result);
  // Flattened cycle order: tools row, then cross-tool row. Matches the
  // visual top-to-bottom, left-to-right reading of the two-row tab bar.
  const tabIds: TabId[] = [
    ...tools.map((t) => t.id as TabId),
    ...crossTool.map((t) => t.id as TabId)
  ];

  useKeys({
    onArrowDown: () => {
      bump();
      if (state.drillStack.length > 0) {
        dispatch({
          type: "listMove",
          direction: "down",
          max: getDrillSkillCount(state, result)
        });
      }
    },
    onArrowUp: () => {
      bump();
      if (state.drillStack.length > 0) {
        dispatch({
          type: "listMove",
          direction: "up",
          max: getDrillSkillCount(state, result)
        });
      }
    },
    onArrowRight: () => {
      bump();
      dispatch({ type: "cycleTab", direction: "next", tabs: tabIds });
    },
    onArrowLeft: () => {
      bump();
      dispatch({ type: "cycleTab", direction: "prev", tabs: tabIds });
    },
    onEnter: () => {
      bump();
      // Phase 8g: minimal Enter binding — drill into the active tool's user
      // scope when a tool tab is active and no drill is currently active.
      if (state.drillStack.length > 0) return;
      if (state.activeTab === "overview") return;
      if (
        state.activeTab === "mcps" ||
        state.activeTab === "access" ||
        state.activeTab === "doctor" ||
        state.activeTab === "settings"
      ) {
        return;
      }
      dispatch({
        type: "drillIn",
        frame: { kind: "userScope", toolId: state.activeTab }
      });
    },
    onEscape: () => {
      bump();
      if (state.searchOpen) {
        dispatch({ type: "searchClose" });
        return;
      }
      dispatch({ type: "drillOut" });
    },
    onSlash: () => {
      bump();
      if (!state.searchOpen) dispatch({ type: "searchOpen" });
    },
    onTextInput: (ch) => {
      bump();
      if (state.searchOpen) {
        dispatch({ type: "searchSetQuery", query: state.searchQuery + ch });
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
      exit();
    }
  });

  return (
    <Frame>
      <Box flexDirection="column">
        <TabBar rows={[tools, crossTool]} activeId={state.activeTab} />
        <Box marginTop={1} flexDirection="column">
          {renderScreen(state, result, dispatch, props.onConfigChange)}
        </Box>
        <IdleWhisper whisper={whisper} />
      </Box>
    </Frame>
  );
}

interface TabRows {
  tools: TabItem[];
  crossTool: ReadonlyArray<TabItem>;
}

function buildTabList(result: MultiProjectScanResult): TabRows {
  const tools: TabItem[] = [{ id: "overview", label: "Overview" }];
  for (const tool of result.userScope.tools) {
    tools.push({ id: tool.id, label: tool.name });
  }
  return { tools, crossTool: CROSS_TOOL_TABS };
}

function renderScreen(
  state: TuiState,
  result: MultiProjectScanResult,
  dispatch: React.Dispatch<TuiAction>,
  onConfigChange: ((devRoots: string[]) => Promise<void>) | undefined
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
    case "mcps":
      return <McpsTab result={result} />;
    case "access":
      return <AccessTab result={result} />;
    case "doctor":
      return <DoctorTab result={result} />;
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

function getDrillSkillCount(state: TuiState, result: MultiProjectScanResult): number {
  const top = state.drillStack[state.drillStack.length - 1];
  if (!top) return 0;

  if (top.kind === "userScope") {
    const tool = result.userScope.tools.find((t) => t.id === top.toolId);
    return filterSkillsByQuery(tool?.skills ?? [], state.searchQuery).length;
  }

  const project = result.projects.find((p) => p.projectPath === top.projectPath);
  const tool = project?.scan.tools.find((t) => t.id === top.toolId);
  return tool?.skills.length ?? 0;
}
