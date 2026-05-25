import React, { useCallback, useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../types.js";
import { fetchScan } from "./api.js";
import { LoadingSplash } from "./components/LoadingSplash.js";
import { IdleWhisper } from "./components/IdleWhisper.js";
import { Overview } from "./views/Overview.js";
import { ToolsView } from "./views/ToolsView.js";
import { McpsView } from "./views/McpsView.js";
import { AccessView } from "./views/AccessView.js";
import { DoctorView } from "./views/DoctorView.js";
import { ActionsView } from "./views/ActionsView.js";
import { SettingsView } from "./views/SettingsView.js";

type TabId =
  | "overview"
  | "tools"
  | "mcps"
  | "access"
  | "doctor"
  | "actions"
  | "settings";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tools", label: "Tools" },
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" },
  { id: "actions", label: "Actions" },
  { id: "settings", label: "Settings" }
];

const DONE_FLASH_MS = 600;

export function App(): React.ReactElement {
  const [tab, setTab] = useState<TabId>("overview");
  const [scan, setScan] = useState<MultiProjectScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justLoaded, setJustLoaded] = useState(false);

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

  return (
    <>
      <header>
        <div>
          <h1>ANKUI</h1>
          <div className="tagline">remember what your AI agents can access</div>
        </div>
        <button
          className="action"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "scanning…" : "refresh"}
        </button>
      </header>

      <nav>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="banner danger">scan failed: {error}</div>}
      {loading && <LoadingSplash phase="loading" />}
      {showDone && <LoadingSplash phase="done" />}
      {scan && !justLoaded && (
        <div className="tab-panel" key={tab}>
          <Body tab={tab} scan={scan} onScan={setScan} />
        </div>
      )}

      <IdleWhisper enabled={scan !== null && !justLoaded} />
    </>
  );
}

function Body(props: {
  tab: TabId;
  scan: MultiProjectScanResult;
  onScan: (scan: MultiProjectScanResult) => void;
}): React.ReactElement {
  switch (props.tab) {
    case "overview":
      return <Overview scan={props.scan} />;
    case "tools":
      return <ToolsView scan={props.scan} />;
    case "mcps":
      return <McpsView scan={props.scan} />;
    case "access":
      return <AccessView scan={props.scan} />;
    case "doctor":
      return <DoctorView scan={props.scan} />;
    case "actions":
      return <ActionsView scan={props.scan} onScan={props.onScan} />;
    case "settings":
      return <SettingsView scan={props.scan} onScan={props.onScan} />;
  }
}
