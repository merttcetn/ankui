import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { aggregateMcps, formatCapabilityTag } from "../../tui/util/mcp-grouping.js";

export function McpsView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const groups = aggregateMcps(props.scan);
  if (groups.length === 0) {
    return <div className="dim">no MCP servers configured.</div>;
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
          {group.configurations.map((cfg, i) => (
            <div className="dim" key={`${cfg.toolId}:${cfg.sourcePath}:${i}`}>
              {cfg.toolId} · {cfg.scope} · {cfg.sourcePath}
            </div>
          ))}
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
