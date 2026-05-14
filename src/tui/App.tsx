import React, { useEffect, useReducer } from "react";
import { Box, useApp } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import { Frame } from "./components/Frame.js";
import { TabBar, type TabItem } from "./components/TabBar.js";
import { useKeys } from "./input/use-keys.js";
import {
  createInitialState,
  tuiReducer,
  type TabId,
  type TuiAction,
  type TuiState
} from "./state/tui-state.js";

import { Overview } from "./screens/Overview.js";
import { ToolTab } from "./screens/ToolTab.js";
import { UserScopeDrillIn } from "./screens/UserScopeDrillIn.js";
import { ProjectDrillIn } from "./screens/ProjectDrillIn.js";
import { McpsTab } from "./screens/McpsTab.js";
import { AccessTab } from "./screens/AccessTab.js";
import { DoctorTab } from "./screens/DoctorTab.js";

export interface DataSource {
  initial: MultiProjectScanResult;
  subscribe?: (cb: (next: MultiProjectScanResult) => void) => () => void;
}

export type AppProps =
  | { result: MultiProjectScanResult; dataSource?: never }
  | { dataSource: DataSource; result?: never };

const CROSS_TOOL_TABS: ReadonlyArray<TabItem> = [
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" }
];

export function App(props: AppProps): React.ReactElement {
  const initialResult = props.dataSource ? props.dataSource.initial : props.result;
  const [state, dispatch] = useReducer(tuiReducer, initialResult, createInitialState);
  const { exit } = useApp();

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
    onTabNext: () => dispatch({ type: "cycleTab", direction: "next", tabs: tabIds }),
    onTabPrev: () => dispatch({ type: "cycleTab", direction: "prev", tabs: tabIds }),
    onEscape: () => dispatch({ type: "drillOut" }),
    onQuit: () => exit()
  });

  return (
    <Frame>
      <Box flexDirection="column">
        <TabBar rows={[tools, crossTool]} activeId={state.activeTab} />
        <Box marginTop={1} flexDirection="column">
          {renderScreen(state, result, dispatch)}
        </Box>
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
  dispatch: React.Dispatch<TuiAction>
): React.ReactElement {
  if (state.drillStack.length > 0) {
    const top = state.drillStack[state.drillStack.length - 1];
    if (top.kind === "userScope") {
      return <UserScopeDrillIn toolId={top.toolId} result={result} />;
    }
    return (
      <ProjectDrillIn
        toolId={top.toolId}
        projectPath={top.projectPath}
        result={result}
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
      // Phase 8f.
      return <Overview result={result} />;
    default:
      return <ToolTab toolId={state.activeTab} result={result} dispatch={dispatch} />;
  }
}
