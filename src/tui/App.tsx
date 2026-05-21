import React, { useEffect, useReducer, useRef, useState } from "react";
import { Box, Text, useApp } from "ink";
import os from "node:os";

import {
  createSkillId,
  type MultiProjectScanResult,
  type Skill,
  type ToolId
} from "../types.js";
import type { SessionAction } from "../utils/session-summary.js";
import {
  disableSkill,
  enableSkill,
  type SkillWriterResult
} from "../writer/index.js";
import type {
  CrawlOptions,
  CrawlResult
} from "../scanner/filesystem-crawler.js";
import { IdleWhisper } from "./components/IdleWhisper.js";
import { ShellWithHints } from "./components/ShellWithHints.js";
import { Sidebar, type TabItem } from "./components/Sidebar.js";
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
import {
  actionsNavigableCount,
  buildActionsModel,
  makeDesiredDisabled,
  type ActionsItem
} from "./util/actions-items.js";
import { deriveKeyHints, FIRST_RUN_KEY_HINTS } from "./util/key-hints.js";
import { aggregateFindings } from "./util/finding-grouping.js";

import { Overview } from "./screens/Overview.js";
import { ToolTab } from "./screens/ToolTab.js";
import { UserScopeDrillIn } from "./screens/UserScopeDrillIn.js";
import { ProjectDrillIn } from "./screens/ProjectDrillIn.js";
import { McpsTab } from "./screens/McpsTab.js";
import { AccessTab } from "./screens/AccessTab.js";
import { DoctorTab } from "./screens/DoctorTab.js";
import { Settings } from "./screens/Settings.js";
import {
  ActionsTab,
  type PendingChange,
  type SkillActionFeedback
} from "./screens/ActionsTab.js";
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

const CROSS_TOOL_TABS: ReadonlyArray<TabItem> = [
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" },
  { id: "actions", label: "Actions" },
  { id: "settings", label: "Settings" }
];

/**
 * Tabs that have no user-scope drill-in. Includes "overview" (a tool-row
 * tab that isn't tied to a single tool) and every cross-tool tab. Used by
 * onEnter to decide whether Enter drills in or merely shifts focus.
 */
const NON_DRILLABLE_TAB_IDS: ReadonlySet<TabId> = new Set<TabId>([
  "overview",
  "mcps",
  "access",
  "doctor",
  "actions",
  "settings"
]);

function isToolTab(id: TabId): id is ToolId {
  return !NON_DRILLABLE_TAB_IDS.has(id);
}

export function App(props: AppProps): React.ReactElement {
  if (props.mode === "firstRun") {
    return <FirstRunShell {...props} />;
  }

  return <MainShell {...(props as MainShellProps)} />;
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
  const [state, dispatch] = useReducer(tuiReducer, initialResult, createInitialState);
  const { exit } = useApp();
  const { whisper, bump } = useIdleWhisper({ enabled: true });
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

  useEffect(() => {
    if (!props.dataSource?.subscribe) return;
    const unsubscribe = props.dataSource.subscribe((next) => {
      setCurrentResult(dispatch, resultRef, next);
    });
    return unsubscribe;
  }, [props.dataSource]);

  useEffect(() => {
    if (!props.result) return;
    if (props.result === state.result) return;
    setCurrentResult(dispatch, resultRef, props.result);
  }, [props.result]);

  const result = state.result;
  resultRef.current = result;
  listCursorRef.current = state.listCursor;
  actionsCollapsedRef.current = state.actionsCollapsed;
  const { tools, crossTool } = buildTabList(result);
  // Flattened cycle order: tools row, then cross-tool row. Matches the
  // visual top-to-bottom, left-to-right reading of the two-row tab bar.
  const tabIds: TabId[] = [
    ...tools.map((t) => t.id as TabId),
    ...crossTool.map((t) => t.id as TabId)
  ];

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

  const cycleSidebar = (direction: "next" | "prev"): void => {
    dispatch({ type: "cycleTab", direction, tabs: tabIds });
    // cycleTab resets focus to "panel" — keep it on the sidebar so ↑↓
    // continues to move the selector instead of jumping into the screen.
    dispatch({ type: "setFocus", focus: "sidebar" });
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

  const savePending = (opts?: { fromQuitConfirm?: boolean }): void => {
    if (savingRef.current) return;
    if (pendingRef.current.length === 0) {
      setSaveSummary("Nothing to save");
      if (opts?.fromQuitConfirm) {
        if (props.onExit) props.onExit(sessionActionsRef.current);
        exit();
      }
      return;
    }
    const queued = skillActionQueueRef.current.then(() => runSave(opts));
    skillActionQueueRef.current = queued.catch(() => undefined);
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
        homeDir: props.homeDir ?? os.homedir(),
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
        { toolId: target.toolId, name: target.name, action: item.action } as SessionAction
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
    if (props.onRefresh && saved > 0) {
      await props.onRefresh();
    }
    if (opts?.fromQuitConfirm && pendingRef.current.length === 0) {
      if (props.onExit) props.onExit(sessionActionsRef.current);
      exit();
    }
  };

  useKeys({
    onArrowDown: () => {
      bump();
      if (state.focus === "sidebar" && state.drillStack.length === 0) {
        cycleSidebar("next");
        return;
      }
      const max = getListMax(state, result);
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
      const max = getListMax(state, result);
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
      if (state.activeTab === "actions") {
        if (ch === "d") stagePending("disable");
        else if (ch === "e") stagePending("enable");
        else if (ch === "s" || ch === "S") savePending();
        else if (ch === " ") toggleActionGroupAtCursor();
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
      if (props.onExit) {
        props.onExit(sessionActionsRef.current);
      }
      exit();
    },
    onRefresh: () => {
      bump();
      if (!props.onRefresh) return;
      void props.onRefresh();
    }
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
              saveSummary
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
  onConfigChange: ((devRoots: string[]) => Promise<void>) | undefined,
  sessionActions: ReadonlyArray<SessionAction>,
  actionFeedback: SkillActionFeedback | null,
  pendingChanges: ReadonlyArray<PendingChange>,
  saving: boolean,
  saveSummary: string | null
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

interface SkillActionSelection {
  id: string;
  toolId: Skill["toolId"];
  kind: Skill["kind"];
  name: string;
}

function setCurrentResult(
  dispatch: React.Dispatch<TuiAction>,
  resultRef: React.MutableRefObject<MultiProjectScanResult>,
  result: MultiProjectScanResult
): void {
  resultRef.current = result;
  dispatch({ type: "setResult", result });
}

/**
 * Resolves the Actions-tab cursor to its model item. Returns a `header` item
 * (cursor on a group header), a `skill` item, or undefined (cursor stale after
 * a collapse). Walks the same model `ActionsTab` renders so indices align.
 */
function actionItemAt(
  result: MultiProjectScanResult,
  collapsed: ReadonlyArray<ToolId>,
  pending: ReadonlyArray<PendingChange>,
  cursor: number
): ActionsItem | undefined {
  const desired = makeDesiredDisabled(pending);
  return buildActionsModel(result, new Set(collapsed), desired).items[cursor];
}

function resolveActionSkill(
  result: MultiProjectScanResult,
  selection: SkillActionSelection
): Skill | undefined {
  const skills = getActionSkills(result);
  return (
    skills.find((skill) => skill.id === selection.id) ??
    skills.find(
      (skill) =>
        skill.toolId === selection.toolId &&
        skill.kind === selection.kind &&
        skill.name === selection.name
    )
  );
}

function getActionSkills(result: MultiProjectScanResult): Skill[] {
  const skills: Skill[] = [];
  for (const tool of result.userScope.tools) {
    if (!tool.detected) continue;
    skills.push(
      ...tool.skills.filter(
        (skill) => skill.kind === "agent_skill" || skill.kind === "skills_sh_skill"
      )
    );
  }
  return skills;
}

function applySkillActionResult(
  result: MultiProjectScanResult,
  target: Skill,
  action: "disable" | "enable",
  newSourcePath: string
): MultiProjectScanResult {
  const disabled = action === "disable";
  let changed = false;
  const tools = result.userScope.tools.map((tool) => {
    if (tool.id !== target.toolId) return tool;
    const skills = tool.skills.map((skill) => {
      if (skill.id !== target.id) return skill;
      changed = true;
      const nextDetails = withDisabledState(skill.details, disabled);
      return {
        ...skill,
        id: createSkillId({
          toolId: skill.toolId,
          kind: skill.kind,
          name: skill.name,
          sourcePath: newSourcePath
        }),
        sourcePath: newSourcePath,
        ...(nextDetails ? { details: nextDetails } : { details: undefined })
      };
    });
    return changed ? { ...tool, skills } : tool;
  });

  if (!changed) return result;
  return {
    ...result,
    userScope: {
      ...result.userScope,
      tools
    }
  };
}

function withDisabledState(
  details: Skill["details"],
  disabled: boolean
): Skill["details"] {
  if (disabled) {
    return { ...(details ?? {}), disabled: true };
  }
  if (!details) return undefined;
  const { disabled: _disabled, ...rest } = details;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function formatSkillActionFailure(
  action: "disable" | "enable",
  skill: Skill,
  reason: Extract<SkillWriterResult, { ok: false }>["reason"]
): string {
  const verb = action === "disable" ? "disable" : "enable";
  let reasonText: string;
  switch (reason) {
    case "target_exists":
      reasonText = "target already exists";
      break;
    case "source_missing":
      reasonText = "source is missing";
      break;
    case "outside_allowed_roots":
      reasonText = "path is outside allowed roots";
      break;
    default: {
      const _exhaustive: never = reason;
      reasonText = _exhaustive;
    }
  }
  return `Could not ${verb} ${skill.toolId}/${skill.name}: ${reasonText}`;
}

function formatSkillActionUnexpectedFailure(
  action: "disable" | "enable",
  skill: Skill
): string {
  const verb = action === "disable" ? "disable" : "enable";
  return `Could not ${verb} ${skill.toolId}/${skill.name}: operation failed`;
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

/**
 * Resolves the max index for the shared `listCursor` based on what the
 * current screen is scrolling through. Drill-in screens scroll skills;
 * the Access tab scrolls flattened findings. Everything else has no
 * scrollable list and returns 0 (which short-circuits arrow handling).
 */
function getListMax(state: TuiState, result: MultiProjectScanResult): number {
  if (state.drillStack.length > 0) return getDrillSkillCount(state, result);
  if (state.activeTab === "access") {
    return aggregateFindings(result).reduce((n, s) => n + s.findings.length, 0);
  }
  if (state.activeTab === "actions") {
    return actionsNavigableCount(result, new Set(state.actionsCollapsed));
  }
  return 0;
}
