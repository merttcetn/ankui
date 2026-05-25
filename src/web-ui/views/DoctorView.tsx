import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import {
  buildDoctorBoard,
  groupWarningsByReason
} from "../../tui/util/doctor-grouping.js";

export function DoctorView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const board = buildDoctorBoard(props.scan);
  const warningGroups = groupWarningsByReason(props.scan);
  return (
    <>
      <h3>detection</h3>
      {board.map((tool) => (
        <div className="skill-line" key={tool.toolId}>
          <span className={tool.detected ? "ok" : "dim"}>
            {tool.detected ? "●" : "○"}
          </span>
          <span className="name">{tool.name}</span>
          <span className="dim">
            {[...tool.userPaths, ...tool.projectPaths].join("  ") || "—"}
          </span>
        </div>
      ))}

      <h3 style={{ marginTop: 16 }}>warnings</h3>
      {warningGroups.length === 0 && (
        <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noWarnings}</div>
      )}
      {warningGroups.map((group) => (
        <div className="row" key={group.reason}>
          <strong>
            {group.reason} ({group.warnings.length})
          </strong>
          <ul>
            {group.warnings.map((w) => (
              <li className="dim" key={w.id}>
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
