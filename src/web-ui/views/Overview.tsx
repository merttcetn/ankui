import React, { useEffect, useState } from "react";
import { MetalFx } from "metal-fx";

import type { MultiProjectScanResult } from "../../types.js";
import { aggregateMcps } from "../../tui/util/mcp-grouping.js";
import { severityLabel } from "../../utils/finding-order.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { Pill } from "../components/Pill.js";
import { StatGrid } from "../components/StatGrid.js";
import type { TabId } from "../components/Sidebar.js";
import {
  buildFindingPresentation,
  findingPresentationTotals
} from "../presentation/findings.js";
import { downloadReport } from "../report-download.js";

export function Overview(props: {
  scan: MultiProjectScanResult;
  onNavigate: (tab: TabId) => void;
}): {
  rail: undefined;
  detail: React.ReactElement;
} {
  const findingSections = buildFindingPresentation(props.scan);
  const findingTotals = findingPresentationTotals(findingSections);
  const priorityGroups = findingSections.flatMap((section) => section.groups).slice(0, 3);
  const detectedTools = props.scan.userScope.tools.filter((tool) => tool.detected).length;
  const totalSkills = props.scan.totals.userScopeSkills + props.scan.totals.skillsAcrossProjects;
  const items = [
    { label: "tools", value: detectedTools },
    { label: "mcp servers", value: aggregateMcps(props.scan).length },
    { label: "skills surfaced", value: totalSkills },
    { label: "projects", value: props.scan.totals.projectCount }
  ];

  const scannedAt = new Date(props.scan.scannedAt).toLocaleString();
  const meta = `SCANNED ${scannedAt.toUpperCase()} · LOCAL · READ-ONLY SCAN`;

  return {
    rail: undefined,
    detail: (
      <>
        <DetailHeader crumb="OVERVIEW / LOCAL SURFACE" title="Your agents, in one frame." meta={meta} />
        <div className="ank-view-body overview-dashboard">
          <section className="overview-hero" aria-labelledby="overview-status-title">
            <div className="overview-hero-copy">
              <span className="overview-kicker">CURRENT EXPOSURE</span>
              <h4 id="overview-status-title">
                {findingTotals.unique === 0
                  ? "The scanned surface is quiet."
                  : `${findingTotals.unique} access pattern${findingTotals.unique === 1 ? "" : "s"} need context.`}
              </h4>
              <p>
                {findingTotals.occurrences === findingTotals.unique
                  ? `${findingTotals.occurrences} occurrence across every scanned surface.`
                  : `${findingTotals.occurrences} occurrences grouped into ${findingTotals.unique} unique findings across every scanned surface.`}
              </p>
            </div>
            <MetallicReviewButton onClick={() => props.onNavigate("access")} />
          </section>

          <StatGrid items={items} />

          <div className="overview-grid">
            <section className="overview-panel overview-priority">
              <div className="overview-panel-head">
                <div>
                  <span>PRIORITY QUEUE</span>
                  <h4>What deserves a look</h4>
                </div>
                <button type="button" onClick={() => props.onNavigate("access")}>View all</button>
              </div>
              {priorityGroups.length === 0 ? (
                <div className="overview-clear-state">
                  <span aria-hidden>○</span>
                  <div><strong>No access findings</strong><small>The current scan produced no review items.</small></div>
                </div>
              ) : priorityGroups.map((group) => (
                <button
                  type="button"
                  className="overview-finding-row"
                  key={group.key}
                  onClick={() => props.onNavigate("access")}
                >
                  <Pill variant={group.severity === "high" ? "danger" : group.severity === "medium" ? "warn" : "info"}>
                    {severityLabel(group.severity)}
                  </Pill>
                  <span><strong>{group.title}</strong><small>{group.categoryLabel}</small></span>
                  <b>{group.occurrences.length}</b>
                </button>
              ))}
            </section>

            <aside className="overview-panel overview-next">
              <span className="overview-panel-label">NEXT CHECKS</span>
              <button type="button" onClick={() => props.onNavigate("changes")}>
                <span><strong>Inspect drift</strong><small>Compare semantic snapshots</small></span><b aria-hidden>→</b>
              </button>
              <button type="button" onClick={() => props.onNavigate("doctor")}>
                <span><strong>Check scan health</strong><small>Review paths and warnings</small></span><b aria-hidden>→</b>
              </button>
              <button type="button" onClick={() => props.onNavigate("actions")}>
                <span><strong>Manage skills</strong><small>Stage local enablement changes</small></span><b aria-hidden>→</b>
              </button>
            </aside>
          </div>

          <section className="overview-report">
            <div>
              <div className="overview-report-title">Shareable sanitized report</div>
              <div className="overview-report-copy">
                Markdown export with strict path anonymization and no raw skill previews.
              </div>
            </div>
            <button
              type="button"
              className="action overview-report-button"
              onClick={() => downloadReport(props.scan)}
            >
              Export report
            </button>
          </section>
        </div>
      </>
    )
  };
}

function MetallicReviewButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const [canEnhance, setCanEnhance] = useState(false);
  const button = (
    <button type="button" className="overview-primary" onClick={onClick}>
      Review access <span aria-hidden>→</span>
    </button>
  );

  useEffect(() => {
    setCanEnhance(supportsMetalFx());
  }, []);

  if (!canEnhance) return button;

  return (
    <MetalFx
      className="overview-metal"
      variant="button"
      preset="silver"
      theme="dark"
      strength={0.72}
      paused={reducedMotion}
      borderRadius={4}
    >
      {button}
    </MetalFx>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (): void => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function supportsMetalFx(): boolean {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      return Boolean(new OffscreenCanvas(1, 1).getContext("webgl"));
    }
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
