import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { StatGrid } from "../components/StatGrid.js";
import { downloadReport } from "../report-download.js";

export function Overview(props: { scan: MultiProjectScanResult }): {
  rail: undefined;
  detail: React.ReactElement;
} {
  const s = props.scan.userScope.summary;
  const items = [
    { label: "tools", value: s.detectedTools },
    { label: "skills (user)", value: s.totalSkills },
    { label: "mcp servers", value: s.uniqueMcpServers },
    { label: "agent skills", value: s.agentSkills },
    { label: "findings", value: s.totalFindings },
    { label: "projects", value: props.scan.totals.projectCount }
  ];

  const scannedAt = new Date(props.scan.scannedAt).toLocaleString();
  const meta = `SCANNED ${scannedAt.toUpperCase()} · LOCAL · READ-ONLY SCAN`;

  return {
    rail: undefined,
    detail: (
      <>
        <DetailHeader crumb="OVERVIEW" title="ankui" meta={meta} />
        <div className="ank-view-body">
          <StatGrid items={items} />
          <div className="overview-report">
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
          </div>
          <p className="ank-detail-meta">
            {props.scan.totals.skillsAcrossProjects} skills across projects
          </p>
        </div>
      </>
    )
  };
}
