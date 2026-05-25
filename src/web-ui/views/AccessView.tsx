import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { aggregateFindings } from "../../tui/util/finding-grouping.js";

export function AccessView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const sections = aggregateFindings(props.scan);
  if (sections.length === 0) {
    return <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noFindings}</div>;
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
