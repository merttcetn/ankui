import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { aggregateMcps, formatCapabilityTag } from "../../tui/util/mcp-grouping.js";
import { formatInlineOriginLabel } from "../../utils/skill-groups.js";

export function McpsView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const groups = aggregateMcps(props.scan);
  if (groups.length === 0) {
    return <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noMcps}</div>;
  }
  return (
    <>
      {groups.map((group) => (
        <div className="row" key={group.name}>
          <h3>
            {group.name}{" "}
            <span className="dim">· {formatCapabilityTag(group)}</span>
          </h3>
          {group.duplicatedAcrossTools && (
            <div className="dim">configured in multiple tools</div>
          )}
          {group.configurations.map((cfg, i) => {
            const originLabel = formatInlineOriginLabel(cfg.bundleOrigin);
            return (
              <div className="dim" key={`${cfg.toolId}:${cfg.sourcePath}:${i}`}>
                {cfg.toolId} · {cfg.scope} · {cfg.sourcePath}
                {originLabel && <> · {originLabel}</>}
              </div>
            );
          })}
          {group.secretEnvKeys.length > 0 && (
            <div className="danger">
              secret env keys: {group.secretEnvKeys.join(", ")}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
