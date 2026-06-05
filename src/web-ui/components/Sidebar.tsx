import React, { useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { aggregateMcps } from "../../tui/util/mcp-grouping.js";
import { aggregateFindings } from "../../tui/util/finding-grouping.js";

export type TabId =
  | "overview"
  | "tools"
  | "mcps"
  | "access"
  | "doctor"
  | "actions"
  | "settings";

interface NavItem {
  id: TabId;
  label: string;
  badge?: number;
  warn?: boolean;
}

export interface SidebarProps {
  scan: MultiProjectScanResult | null;
  activeTab: TabId;
  onSelect: (id: TabId) => void;
  onRefresh: () => void;
  refreshing: boolean;
  justDone: boolean;
}

function formatAgo(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function Sidebar({ scan, activeTab, onSelect, onRefresh, refreshing, justDone }: SidebarProps): React.ReactElement {
  const parsedScanAt = scan ? Date.parse(scan.scannedAt) : NaN;
  const lastScanAt = Number.isFinite(parsedScanAt) ? parsedScanAt : null;
  const mcpCount = scan ? aggregateMcps(scan).length : undefined;
  const findingCount = scan
    ? aggregateFindings(scan).reduce((sum, s) => sum + s.findings.length, 0)
    : undefined;

  const items: NavItem[] = [
    { id: "overview", label: "Overview" },
    {
      id: "tools",
      label: "Tools",
      badge: scan?.userScope.tools.filter((t) => t.detected).length
    },
    {
      id: "mcps",
      label: "MCPs",
      badge: mcpCount
    },
    {
      id: "access",
      label: "Access",
      badge: findingCount,
      warn: (findingCount ?? 0) > 0
    },
    { id: "doctor", label: "Doctor" },
    { id: "actions", label: "Actions" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <>
      <div className="ank-side-brand">
        <div className="ank-side-name">ankui</div>
        <div className="ank-side-tag">remember what your agents can access</div>
      </div>
      <nav className="ank-side-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ank-side-link${item.id === activeTab ? " is-active" : ""}${item.warn ? " has-warn" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ank-side-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="ank-side-foot">
        <button
          type="button"
          className={`ank-side-refresh${refreshing ? " is-scanning" : ""}${justDone ? " is-done" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-keyshortcuts="R"
        >
          <span className="ank-side-refresh-dot" aria-hidden />
          <span className="ank-side-refresh-label">
            {refreshing ? "scanning" : justDone ? "done" : "refresh"}
          </span>
          <span className="ank-side-refresh-key" aria-hidden>R</span>
          <span className="ank-side-refresh-underline" aria-hidden />
        </button>
        <FootMeta lastScanAt={lastScanAt} />
      </div>
    </>
  );
}

function FootMeta({ lastScanAt }: { lastScanAt: number | null }): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastScanAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [lastScanAt]);
  if (lastScanAt === null) {
    return <div className="ank-side-foot-meta">LOCAL · READ-ONLY SCAN</div>;
  }
  return (
    <div className="ank-side-foot-meta">
      LAST SCAN <span className="ank-side-foot-time">{formatAgo(lastScanAt, now)}</span>
    </div>
  );
}
