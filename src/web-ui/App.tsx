import React, { useCallback, useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../types.js";
import { fetchScan } from "./api.js";
import { Overview } from "./views/Overview.js";
import { ToolsView } from "./views/ToolsView.js";
import { McpsView } from "./views/McpsView.js";
import { AccessView } from "./views/AccessView.js";
import { DoctorView } from "./views/DoctorView.js";
import { ActionsView } from "./views/ActionsView.js";

type TabId = "overview" | "tools" | "mcps" | "access" | "doctor" | "actions";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tools", label: "Tools" },
  { id: "mcps", label: "MCPs" },
  { id: "access", label: "Access" },
  { id: "doctor", label: "Doctor" },
  { id: "actions", label: "Actions" }
];

export function App(): React.ReactElement {
  const [tab, setTab] = useState<TabId>("overview");
  const [scan, setScan] = useState<MultiProjectScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScan(await fetchScan());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <header>
        <div>
          <h1>ANKUI</h1>
          <div className="tagline">remember what your AI agents can access</div>
        </div>
        <button className="action" onClick={() => void refresh()} disabled={loading}>
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
      {!scan && !error && <div className="dim">loading scan…</div>}
      {scan && <Body tab={tab} scan={scan} onScan={setScan} />}
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
  }
}
