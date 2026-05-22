import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { aggregateFindings } from "../../tui/util/finding-grouping.js";

export function AccessView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const sections = aggregateFindings(props.scan);
  if (sections.length === 0) {
    return <div className="dim">the talismans are holding. no findings.</div>;
  }
  return (
    <>
      {sections.map((section) => (
        <div key={section.category}>
          <h3>
            {section.label}{" "}
            <span className="dim">({section.findings.length})</span>
          </h3>
          {section.findings.map((finding) => (
            <div className="row" key={finding.id}>
              <strong>{finding.title}</strong>
              <div className="dim">{finding.message}</div>
              <div>{finding.recommendation}</div>
              {finding.sourcePaths.map((p) => (
                <div className="dim" key={p}>
                  {p}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
