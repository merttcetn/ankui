import React from "react";

import type { MultiProjectScanResult } from "../../types.js";

export function Overview(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const s = props.scan.userScope.summary;
  const cards: ReadonlyArray<{ label: string; num: number }> = [
    { label: "tools detected", num: s.detectedTools },
    { label: "skills (user)", num: s.totalSkills },
    { label: "MCP servers", num: s.uniqueMcpServers },
    { label: "agent skills", num: s.agentSkills },
    { label: "findings", num: s.totalFindings },
    { label: "projects", num: props.scan.totals.projectCount }
  ];
  return (
    <>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="num">{c.num}</div>
            <div className="label">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="dim">
        scanned {new Date(props.scan.scannedAt).toLocaleString()} ·{" "}
        {props.scan.totals.skillsAcrossProjects} skills across projects
      </p>
    </>
  );
}
