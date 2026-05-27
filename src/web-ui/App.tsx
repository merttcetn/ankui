import React, { useCallback, useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../types.js";
import { fetchScan } from "./api.js";
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

  const selectFor = useCallback(
    (which: TabId) => (id: string) => {
      setSelections((prev) => ({ ...prev, [which]: id }));
    },
    []
  );

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

  const loading = scan === null && !error;
  const showDone = scan !== null && justLoaded;

  const view: { rail: React.ReactNode; detail: React.ReactNode } | null =
    scan && !justLoaded ? Body({ tab, scan, onScan: setScan, selections, selectFor }) : null;

  const detail = (
    <>
      {error && <div className="banner danger">scan failed: {error}</div>}
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
    case "doctor":    return { rail: undefined, detail: <DoctorView scan={props.scan} /> };
    case "actions":   return { rail: undefined, detail: <ActionsView scan={props.scan} onScan={props.onScan} /> };
    case "settings":  return { rail: undefined, detail: <SettingsView scan={props.scan} onScan={props.onScan} /> };
  }
}
