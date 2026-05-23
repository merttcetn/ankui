import React, { useEffect, useRef, useState } from "react";

import type { AITool, MultiProjectScanResult, ToolId } from "../../types.js";
import {
  groupSkillsByKind,
  SKILL_KIND_ORDER
} from "../../tui/util/skill-grouping.js";

export function ToolsView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const [open, setOpen] = useState<ToolId | null>(null);
  const tools = props.scan.userScope.tools;
  return (
    <>
      {tools.map((tool) => (
        <div className="row" key={tool.id}>
          <h3
            style={{ cursor: "pointer" }}
            onClick={() => setOpen(open === tool.id ? null : tool.id)}
          >
            {open === tool.id ? "▾ " : "▸ "}
            {tool.name}{" "}
            <span className="dim">
              {tool.detected ? `· ${tool.skills.length} skills` : "· not detected"}
            </span>
          </h3>
          {open === tool.id && tool.detected && <ExpandedPanel tool={tool} />}
        </div>
      ))}
    </>
  );
}

function ExpandedPanel({ tool }: { tool: AITool }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const grouped = groupSkillsByKind(tool.skills);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollHeight > el.clientHeight);
    setAtBottom(false);
  }, [tool.id]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  };

  const panelClass = atBottom ? "tools-expanded at-bottom" : "tools-expanded";
  const hintClass = atBottom ? "scroll-hint hidden" : "scroll-hint";

  return (
    <>
      <div className={panelClass} ref={ref} onScroll={onScroll}>
        {tool.detectedPaths.map((p) => (
          <div className="dim" key={p}>
            {p}
          </div>
        ))}
        {SKILL_KIND_ORDER.map((kind) => {
          const skills = grouped.get(kind);
          if (!skills || skills.length === 0) return null;
          return (
            <div key={kind}>
              <div className="dim" style={{ marginTop: 6 }}>
                {kind} ({skills.length})
              </div>
              {skills.map((sk) => (
                <div className="skill-line" key={sk.id}>
                  <span className="name">{sk.name}</span>
                  {sk.details?.disabled === true && (
                    <span className="dim">disabled</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {overflow && <div className={hintClass}>↓ scroll for more</div>}
    </>
  );
}
