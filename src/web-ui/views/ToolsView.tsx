import React, { useEffect, useRef, useState } from "react";

import type { AITool, MultiProjectScanResult, ToolId } from "../../types.js";
import { groupSkillsByOrigin } from "../../utils/skill-groups.js";
import { SkillGroupSection } from "../components/SkillGroupSection.js";
import { useExpandedGroups } from "../hooks/useExpandedGroups.js";

export function ToolsView(props: {
  scan: MultiProjectScanResult;
}): React.ReactElement {
  const [open, setOpen] = useState<ToolId | null>(null);
  const { isExpanded, toggle } = useExpandedGroups("tools");
  const tools = props.scan.userScope.tools;
  return (
    <>
      {tools.map((tool) => {
        const isOpen = open === tool.id;
        return (
          <div className="row" key={tool.id}>
            <h3
              style={{ cursor: "pointer" }}
              onClick={() => setOpen(isOpen ? null : tool.id)}
            >
              <span className={isOpen ? "caret open" : "caret"}>▸</span>{" "}
              {tool.name}{" "}
              <span className="dim">
                {tool.detected ? `· ${tool.skills.length} skills` : "· not detected"}
              </span>
            </h3>
            {tool.detected && (
              <div className={isOpen ? "tools-acc open" : "tools-acc"}>
                <div className="tools-acc-inner">
                  <ExpandedPanel
                    tool={tool}
                    isExpanded={isExpanded}
                    onToggle={toggle}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ExpandedPanel(props: {
  tool: AITool;
  isExpanded: (label: string, alwaysExpanded: boolean) => boolean;
  onToggle: (label: string) => void;
}): React.ReactElement {
  const { tool, isExpanded, onToggle } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const groups = groupSkillsByOrigin(tool.skills);

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
        {groups.map((group) => (
          <SkillGroupSection
            key={group.label}
            group={group}
            expanded={isExpanded(group.label, group.alwaysExpanded)}
            onToggle={() => onToggle(group.label)}
          >
            {group.skills.map((sk) => (
              <div className="skill-line" key={sk.id}>
                <span className="name">{sk.name}</span>
                {sk.details?.disabled === true && (
                  <span className="dim">disabled</span>
                )}
              </div>
            ))}
          </SkillGroupSection>
        ))}
      </div>
      {overflow && <div className={hintClass}>↓ scroll for more</div>}
    </>
  );
}
