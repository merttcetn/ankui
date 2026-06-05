import React, { useCallback, useEffect, useState } from "react";

import type { MultiProjectScanResult, Skill } from "../types.js";
import { applyActions, fetchScan, type ActionRequest } from "./api.js";
import { Banner } from "./components/Banner.js";
import { LoadingSplash } from "./components/LoadingSplash.js";
import { IdleWhisper } from "./components/IdleWhisper.js";
import { Shell } from "./components/Shell.js";
import { Sidebar, type TabId } from "./components/Sidebar.js";
import { Overview } from "./views/Overview.js";
import { ToolsView } from "./views/ToolsView.js";
import { McpsView } from "./views/McpsView.js";
import { AccessView } from "./views/AccessView.js";
import { DoctorView } from "./views/DoctorView.js";
import { ActionsView } from "./views/ActionsView.js";
import { SettingsView } from "./views/SettingsView.js";

const DONE_FLASH_MS = 600;

interface ActionsPending {
  id: string;
  action: "disable" | "enable";
}

function findSkillById(scan: MultiProjectScanResult, id: string): Skill | undefined {
  for (const tool of scan.userScope.tools) {
    const found = tool.skills.find((s) => s.id === id);
    if (found) return found;
  }
  for (const project of scan.projects) {
    for (const tool of project.scan.tools) {
      const found = tool.skills.find((s) => s.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

export function App(): React.ReactElement {
  const [tab, setTab] = useState<TabId>("overview");
  const [scan, setScan] = useState<MultiProjectScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justLoaded, setJustLoaded] = useState(false);
  const [selections, setSelections] = useState<Record<TabId, string | null>>({
    overview: null,
    tools: null,
    mcps: null,
    access: null,
    doctor: null,
    actions: null,
    settings: null
  });
  // Lifted from ActionsView so the rail's pending pip and the panel's save
  // bar agree on the same pending list (ActionsView itself is hook-free).
  const [actionsPending, setActionsPending] = useState<ActionsPending[]>([]);
  const [actionsSaving, setActionsSaving] = useState(false);
  const [actionsStatus, setActionsStatus] = useState<string | null>(null);

  const selectFor = useCallback(
    (which: TabId) => (id: string) => {
      setSelections((prev) => ({ ...prev, [which]: id }));
    },
    []
  );

  const stageAction = useCallback(
    (id: string, action: "disable" | "enable", diskDisabled: boolean) => {
      setActionsPending((prev) => {
        const without = prev.filter((p) => p.id !== id);
        const nextDisabled = action === "disable";
        if (nextDisabled === diskDisabled) return without;
        return [...without, { id, action }];
      });
    },
    []
  );

  const stageBulkAction = useCallback(
    (changes: Array<{ id: string; action: "disable" | "enable"; diskDisabled: boolean }>) => {
      setActionsPending((prev) => {
        const ids = new Set(changes.map((c) => c.id));
        const next = prev.filter((p) => !ids.has(p.id));
        for (const c of changes) {
          if (c.diskDisabled === (c.action === "disable")) continue;
          next.push({ id: c.id, action: c.action });
        }
        return next;
      });
    },
    []
  );

  const discardActions = useCallback(() => {
    setActionsPending([]);
    setActionsStatus(null);
  }, []);

  const saveActions = useCallback(async () => {
    setActionsSaving(true);
    setActionsStatus(null);
    try {
      const changes: ActionRequest[] = actionsPending.map((p) => ({
        skillId: p.id,
        action: p.action
      }));
      const res = await applyActions(changes);
      const failed = res.outcomes.filter((o) => !o.ok);
      setActionsStatus(
        failed.length === 0
          ? `saved ${res.outcomes.length} change(s)`
          : `${failed.length} failed: ${failed[0].message}`
      );
      const failedIds = new Set(failed.map((o) => o.skillId));
      setActionsPending((prev) => prev.filter((p) => failedIds.has(p.id)));
      setScan(res.scan);
    } catch (err) {
      setActionsStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setActionsSaving(false);
    }
  }, [actionsPending]);

  const refresh = useCallback(async () => {
    setError(null);
    setJustLoaded(false);
    setScan(null);
    try {
      const result = await fetchScan();
      setScan(result);
      setJustLoaded(true);
      window.setTimeout(() => setJustLoaded(false), DONE_FLASH_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "r" && event.key !== "R") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (el.isContentEditable) return;
      }
      // Block only during an active load (scan null + no error). Error state
      // should still allow retry — sidebar's refresh button is enabled there.
      if (scan === null && error === null) return;
      event.preventDefault();
      void refresh();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh, scan, error]);

  useEffect(() => {
    if (!scan) return;
    setActionsPending((prev) =>
      prev.filter((p) => {
        const skill = findSkillById(scan, p.id);
        if (!skill) return false;
        const diskDisabled = skill.details?.disabled === true;
        const wouldBeDisabled = p.action === "disable";
        return diskDisabled !== wouldBeDisabled;
      })
    );
  }, [scan]);

  const loading = scan === null && !error;
  const showDone = scan !== null && justLoaded;

  const view: { rail: React.ReactNode; detail: React.ReactNode } | null =
    scan && !justLoaded
      ? Body({
          tab,
          scan,
          onScan: setScan,
          selections,
          selectFor,
          actionsPending,
          actionsSaving,
          actionsStatus,
          stageAction,
          stageBulkAction,
          discardActions,
          saveActions
        })
      : null;

  const detail = (
    <>
      {error && <Banner variant="danger" badge="ERROR">scan failed: {error}</Banner>}
      {loading && <LoadingSplash phase="loading" />}
      {showDone && <LoadingSplash phase="done" />}
      {view && (
        <div className="tab-panel" key={tab}>
          {view.detail}
        </div>
      )}
      <IdleWhisper enabled={scan !== null && !justLoaded} />
    </>
  );

  return (
    <Shell
      sidebar={
        <Sidebar
          scan={scan}
          activeTab={tab}
          onSelect={setTab}
          onRefresh={() => void refresh()}
          refreshing={loading}
          justDone={showDone}
        />
      }
      rail={view?.rail}
      detail={detail}
    />
  );
}

function Body(props: {
  tab: TabId;
  scan: MultiProjectScanResult;
  onScan: (scan: MultiProjectScanResult) => void;
  selections: Record<TabId, string | null>;
  selectFor: (which: TabId) => (id: string) => void;
  actionsPending: ActionsPending[];
  actionsSaving: boolean;
  actionsStatus: string | null;
  stageAction: (id: string, action: "disable" | "enable", diskDisabled: boolean) => void;
  stageBulkAction: (
    changes: Array<{ id: string; action: "disable" | "enable"; diskDisabled: boolean }>
  ) => void;
  discardActions: () => void;
  saveActions: () => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  switch (props.tab) {
    case "overview":  return Overview({ scan: props.scan });
    case "tools":     return ToolsView({
      scan: props.scan,
      selectedId: props.selections.tools,
      onSelectId: props.selectFor("tools")
    });
    case "mcps":      return McpsView({
      scan: props.scan,
      selectedId: props.selections.mcps,
      onSelectId: props.selectFor("mcps")
    });
    case "access":    return AccessView({
      scan: props.scan,
      selectedId: props.selections.access,
      onSelectId: props.selectFor("access")
    });
    case "doctor":    return DoctorView({
      scan: props.scan,
      selectedId: props.selections.doctor,
      onSelectId: props.selectFor("doctor")
    });
    case "actions":   return ActionsView({
      scan: props.scan,
      selectedId: props.selections.actions,
      onSelectId: props.selectFor("actions"),
      onScan: props.onScan,
      pending: props.actionsPending,
      saving: props.actionsSaving,
      status: props.actionsStatus,
      onStage: props.stageAction,
      onBulkStage: props.stageBulkAction,
      onDiscard: props.discardActions,
      onSave: props.saveActions
    });
    case "settings":  return SettingsView({
      scan: props.scan,
      selectedId: props.selections.settings,
      onSelectId: props.selectFor("settings"),
      onScan: props.onScan
    });
  }
}
