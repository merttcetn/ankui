import React, { useEffect, useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { aggregateMcps } from "../../tui/util/mcp-grouping.js";
import {
  buildFindingPresentation,
  findingPresentationTotals
} from "../presentation/findings.js";
import { DotMatrixCoreSpiral } from "./DotMatrixCoreSpiral.js";

export type TabId =
  | "overview"
  | "changes"
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

interface NavGroup {
  label: string;
  items: NavItem[];
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
    ? findingPresentationTotals(buildFindingPresentation(scan)).unique
    : undefined;

  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { id: "overview", label: "Overview" },
        { id: "changes", label: "Changes" }
      ]
    },
    {
      label: "Inventory",
      items: [
        {
          id: "tools",
          label: "Tools",
          badge: scan?.userScope.tools.filter((t) => t.detected).length
        },
        { id: "mcps", label: "MCPs", badge: mcpCount },
        {
          id: "access",
          label: "Access",
          badge: findingCount,
          warn: (findingCount ?? 0) > 0
        },
        { id: "doctor", label: "Doctor" }
      ]
    },
    {
      label: "Control",
      items: [
        { id: "actions", label: "Actions" },
        { id: "settings", label: "Settings" }
      ]
    }
  ];

  return (
    <>
      <div className="ank-side-brand">
        <div className="ank-side-eyebrow">LOCAL AGENT INDEX</div>
        <div className="ank-side-brand-row">
          <div className="ank-side-name">ankui</div>
          <span className="ank-side-status" aria-label="Local scan ready" />
        </div>
        <div className="ank-side-tag">remember what your agents can access</div>
      </div>
      <nav className="ank-side-nav" aria-label="Primary navigation">
        {groups.map((group) => (
          <div className="ank-side-group" key={group.label}>
            <div className="ank-side-group-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ank-side-link${item.id === activeTab ? " is-active" : ""}${item.warn ? " has-warn" : ""}`}
                onClick={() => onSelect(item.id)}
                aria-current={item.id === activeTab ? "page" : undefined}
              >
                <span className="ank-side-link-text">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ank-side-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="ank-side-foot">
        <div className="ank-side-foot-label">SCAN CONTROL</div>
        <button
          type="button"
          className={`ank-side-refresh${refreshing ? " is-scanning" : ""}${justDone ? " is-done" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-keyshortcuts="R"
        >
          {refreshing ? (
            <DotMatrixCoreSpiral
              className="ank-side-refresh-loader"
              size={18}
              dotSize={2}
              decorative
            />
          ) : (
            <span className="ank-side-refresh-dot" aria-hidden />
          )}
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
