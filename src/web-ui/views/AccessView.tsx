import React, { useMemo, useState } from "react";

import type { Finding, FindingScope, MultiProjectScanResult, ToolId } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { severityLabel } from "../../utils/finding-order.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail } from "../components/EntityRail.js";
import { Pill, type PillVariant } from "../components/Pill.js";
import {
  buildFindingPresentation,
  type FindingPresentationGroup
} from "../presentation/findings.js";

function variantForSeverity(severity: Finding["severity"]): PillVariant {
  switch (severity) {
    case "high": return "danger";
    case "medium": return "warn";
    case "low": return "info";
  }
}

export function AccessView(props: {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  const sections = buildFindingPresentation(props.scan);

  if (sections.length === 0) {
    return {
      rail: undefined,
      detail: <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noFindings}</div>
    };
  }

  const selectedId = props.selectedId ?? sections[0].category;
  const selected = sections.find((section) => section.category === selectedId) ?? sections[0];

  const rail = (
    <EntityRail
      sections={[{
        heading: "finding types",
        items: sections.map((section) => ({
          id: section.category,
          label: section.label,
          count: section.groups.length,
          pip: section.groups.some((group) => group.severity !== "low") ? "warn" : undefined
        }))
      }]}
      selectedId={selectedId}
      onSelect={props.onSelectId}
      searchPlaceholder="Filter finding types…"
    />
  );

  const detail = (
    <>
      <DetailHeader
        crumb={`ACCESS / ${selected.label.toUpperCase()}`}
        title={selected.label}
        meta={`${selected.groups.length} UNIQUE · ${selected.occurrenceCount} OCCURRENCE${selected.occurrenceCount === 1 ? "" : "S"}`}
      />
      <AccessPanel groups={selected.groups} />
    </>
  );

  return { rail, detail };
}

function AccessPanel({ groups }: { groups: FindingPresentationGroup[] }): React.ReactElement {
  const [severity, setSeverity] = useState<Finding["severity"] | "all">("all");
  const [tool, setTool] = useState<ToolId | "all">("all");
  const [scope, setScope] = useState<FindingScope | "all">("all");

  const tools = useMemo(() => [...new Set(groups.flatMap((group) => group.toolIds))].sort(), [groups]);
  const scopes = useMemo(() => [...new Set(groups.flatMap((group) => group.scopes))].sort(), [groups]);
  const filtered = groups.filter((group) =>
    (severity === "all" || group.severity === severity) &&
    (tool === "all" || group.toolIds.includes(tool)) &&
    (scope === "all" || group.scopes.includes(scope))
  );

  return (
    <div className="ank-view-body access-view">
      <div className="access-toolbar" aria-label="Finding filters">
        <span>{filtered.length} shown</span>
        <FilterSelect label="Severity" value={severity} onChange={(value) => setSeverity(value as Finding["severity"] | "all")}>
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </FilterSelect>
        <FilterSelect label="Tool" value={tool} onChange={(value) => setTool(value as ToolId | "all")}>
          <option value="all">All tools</option>
          {tools.map((item) => <option key={item} value={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Scope" value={scope} onChange={(value) => setScope(value as FindingScope | "all")}>
          <option value="all">All scopes</option>
          {scopes.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
        </FilterSelect>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-whisper">no findings match these filters.</div>
      ) : filtered.map((group) => <FindingDisclosure key={group.key} group={group} />)}
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="access-filter">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.children}
      </select>
    </label>
  );
}

function FindingDisclosure({ group }: { group: FindingPresentationGroup }): React.ReactElement {
  const contexts = [...new Set(group.occurrences.map((occurrence) => occurrence.context))];
  return (
    <details className={`access-finding is-${group.severity}`}>
      <summary>
        <Pill variant={variantForSeverity(group.severity)}>{severityLabel(group.severity)}</Pill>
        <span className="access-finding-copy">
          <strong>{group.title}</strong>
          <small>{group.message}</small>
        </span>
        <span className="access-occurrence">
          {group.occurrences.length}<small>occurrence{group.occurrences.length === 1 ? "" : "s"}</small>
        </span>
        <span className="access-caret" aria-hidden>⌄</span>
      </summary>
      <div className="access-finding-detail">
        {group.recommendation && (
          <div className="access-recommendation">
            <span>RECOMMENDATION</span>
            <p>{group.recommendation}</p>
          </div>
        )}
        <dl>
          <div><dt>Tools</dt><dd>{group.toolIds.join(", ")}</dd></div>
          <div><dt>Scope</dt><dd>{group.scopes.join(", ").replaceAll("_", " ")}</dd></div>
          <div>
            <dt>Seen in</dt>
            <dd className="access-value-list">
              {contexts.map((context) => <span key={context}>{context}</span>)}
            </dd>
          </div>
          {group.sourcePaths.length > 0 && (
            <div><dt>Sources</dt><dd className="access-value-list">{group.sourcePaths.map((path) => <code key={path} title={path}>{path}</code>)}</dd></div>
          )}
        </dl>
      </div>
    </details>
  );
}
