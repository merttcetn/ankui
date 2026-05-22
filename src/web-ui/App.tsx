import React, { useCallback, useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../types.js";
import { fetchScan } from "./api.js";

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
  // Replaced in the next task with the real view router.
  return <div className="dim">view “{props.tab}” — pending the views task</div>;
}
