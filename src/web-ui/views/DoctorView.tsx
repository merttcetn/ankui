import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import {
  buildDoctorBoard,
  groupWarningsByReason
} from "../../tui/util/doctor-grouping.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail, type EntityRailSection } from "../components/EntityRail.js";
import { SectionLabel } from "../components/SectionLabel.js";
import { SkillRow } from "../components/SkillRow.js";

export function DoctorView(props: {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  const board = buildDoctorBoard(props.scan);
  const warningGroups = groupWarningsByReason(props.scan);

  const sections: EntityRailSection[] = [
    {
      heading: "tools",
      items: board.map((b) => ({
        id: `tool:${b.toolId}`,
        label: b.name,
        pip: b.detected ? "ok" : undefined
      }))
    },
    {
      heading: "warnings",
      items: warningGroups.map((g) => ({
        id: `warn:${g.reason}`,
        label: g.reason,
        count: g.warnings.length,
        pip: "warn"
      }))
    }
  ];

  const defaultId = board[0] ? `tool:${board[0].toolId}` : null;
  const selectedId = props.selectedId ?? defaultId;

  const rail = (
    <EntityRail
      sections={sections}
      selectedId={selectedId}
      onSelect={props.onSelectId}
    />
  );

  return { rail, detail: renderDetail(selectedId, board, warningGroups) };
}

function renderDetail(
  selectedId: string | null,
  board: ReturnType<typeof buildDoctorBoard>,
  warningGroups: ReturnType<typeof groupWarningsByReason>
): React.ReactElement {
  if (selectedId?.startsWith("tool:")) {
    const id = selectedId.slice("tool:".length);
    const tool = board.find((b) => b.toolId === id);
    if (!tool) return <div className="empty-whisper">no tool selected.</div>;
    const allPaths = [...tool.userPaths, ...tool.projectPaths];
    return (
      <>
        <DetailHeader
          crumb={`DOCTOR / TOOLS / ${tool.name.toUpperCase()}`}
          title={tool.name}
          meta={tool.detected ? "DETECTED" : "NOT DETECTED"}
        />
        <SectionLabel count={allPaths.length}>discovered paths</SectionLabel>
        {allPaths.length === 0 ? (
          <div className="empty-whisper">no paths discovered for this tool.</div>
        ) : (
          allPaths.map((p) => <SkillRow key={p} name={p} />)
        )}
      </>
    );
  }
  if (selectedId?.startsWith("warn:")) {
    const reason = selectedId.slice("warn:".length);
    const group = warningGroups.find((g) => g.reason === reason);
    if (!group) return <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noWarnings}</div>;
    return (
      <>
        <DetailHeader
          crumb={`DOCTOR / WARNINGS / ${group.reason.toUpperCase()}`}
          title={group.reason}
          meta={`${group.warnings.length} WARNING${group.warnings.length === 1 ? "" : "S"}`}
        />
        {group.warnings.map((w) => (
          <SkillRow key={w.id} name={w.message} source={w.path ?? undefined} />
        ))}
      </>
    );
  }
  return <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noWarnings}</div>;
}
