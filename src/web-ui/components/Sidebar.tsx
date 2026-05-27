import React from "react";

import type { MultiProjectScanResult } from "../../types.js";

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
}

export function Sidebar({ scan, activeTab, onSelect, onRefresh, refreshing }: SidebarProps): React.ReactElement {
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
      badge: scan?.userScope.summary.uniqueMcpServers
    },
    {
      id: "access",
      label: "Access",
      badge: scan?.userScope.summary.totalFindings,
      warn: (scan?.userScope.summary.totalFindings ?? 0) > 0
    },
    { id: "doctor", label: "Doctor" },
    { id: "actions", label: "Actions" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <>
      <div className="ank-side-brand">
        <div className="ank-side-name">ANKUI</div>
        <div className="ank-side-tag">remember what your<br />agents can access</div>
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
          className="ank-side-refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "scanning…" : "refresh"}
        </button>
        <div className="ank-side-foot-meta">LOCAL · READ-ONLY</div>
      </div>
    </>
  );
}
