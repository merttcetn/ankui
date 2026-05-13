import React, { useReducer } from "react";
import { Box, useApp } from "ink";

import type { MultiProjectScanResult } from "../types.js";
import { Frame } from "./components/Frame.js";
import { TabBar, type TabItem } from "./components/TabBar.js";
import { useKeys } from "./input/use-keys.js";
import {
  INITIAL_STATE,
  tuiReducer,
  type TabId,
  type TuiAction,
  type TuiState
} from "./state/tui-state.js";

import { Overview } from "./screens/Overview.js";
import { ToolTab } from "./screens/ToolTab.js";
import { UserScopeDrillIn } from "./screens/UserScopeDrillIn.js";
import { ProjectDrillIn } from "./screens/ProjectDrillIn.js";

export interface AppProps {
  result: MultiProjectScanResult;
}

export function App({ result }: AppProps): React.ReactElement {
  const [state, dispatch] = useReducer(tuiReducer, INITIAL_STATE);
  const { exit } = useApp();

  const tabs = buildTabList(result);
  const tabIds = tabs.map((t) => t.id as TabId);

  useKeys({
    onTabNext: () => dispatch({ type: "cycleTab", direction: "next", tabs: tabIds }),
    onTabPrev: () => dispatch({ type: "cycleTab", direction: "prev", tabs: tabIds }),
    onEscape: () => dispatch({ type: "drillOut" }),
    onQuit: () => exit()
  });

  return (
    <Frame>
      <Box flexDirection="column">
        <TabBar rows={[tabs]} activeId={state.activeTab} />
        <Box marginTop={1} flexDirection="column">
          {renderScreen(state, result, dispatch)}
        </Box>
      </Box>
    </Frame>
  );
}

function buildTabList(result: MultiProjectScanResult): TabItem[] {
  const items: TabItem[] = [{ id: "overview", label: "Overview" }];
  for (const tool of result.userScope.tools) {
    items.push({ id: tool.id, label: tool.name });
  }
  return items;
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
  if (state.activeTab === "overview") {
    return <Overview result={result} />;
  }
  if (
    state.activeTab === "mcps" ||
    state.activeTab === "access" ||
    state.activeTab === "doctor" ||
    state.activeTab === "settings"
  ) {
    return <Overview result={result} />;
  }
  return <ToolTab toolId={state.activeTab} result={result} dispatch={dispatch} />;
}
