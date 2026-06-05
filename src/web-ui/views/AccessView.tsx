import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import { aggregateFindings } from "../../tui/util/finding-grouping.js";
import { Banner } from "../components/Banner.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail } from "../components/EntityRail.js";

function variantForCategory(category: string): { variant: "danger" | "warn" | "info"; badge: string } {
  switch (category) {
    case "dangerous_pattern":       return { variant: "danger", badge: "DANGER" };
    case "secret_reference":        return { variant: "warn", badge: "SECRET" };
    case "duplicate_mcp":           return { variant: "info", badge: "DUPLICATE" };
    case "broad_access_capability": return { variant: "warn", badge: "BROAD" };
    case "unknown_capability":      return { variant: "info", badge: "UNKNOWN" };
    default:                        return { variant: "info", badge: category.toUpperCase() };
  }
}

export function AccessView(props: {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  const sections = aggregateFindings(props.scan);

  if (sections.length === 0) {
    return {
      rail: undefined,
      detail: <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noFindings}</div>
    };
  }

  const selectedId = props.selectedId ?? sections[0].category;
  const selected = sections.find((s) => s.category === selectedId) ?? sections[0];

  const rail = (
    <EntityRail
      sections={[
        {
          heading: "findings",
          items: sections.map((s) => ({
            id: s.category,
            label: s.label,
            count: s.findings.length,
            pip:
              s.category === "dangerous_pattern" || s.category === "secret_reference"
                ? "warn"
                : undefined
          }))
        }
      ]}
      selectedId={selectedId}
      onSelect={props.onSelectId}
    />
  );

  const { variant, badge } = variantForCategory(selected.category);
  const fCount = selected.findings.length;

  const detail = (
    <>
      <DetailHeader
        crumb={`ACCESS / ${selected.label.toUpperCase()}`}
        title={selected.label}
        meta={`${fCount} FINDING${fCount === 1 ? "" : "S"}`}
      />
      <div className="ank-view-body">
        {selected.findings.map((finding) => (
          <Banner key={finding.id} variant={variant} badge={badge}>
            <strong>{finding.title}</strong>
            <span className="ank-finding-msg"> · {finding.message}</span>
            {finding.recommendation && (
              <span className="ank-finding-rec"> — {finding.recommendation}</span>
            )}
            {finding.sourcePaths.length > 0 && (
              <span className="ank-finding-src">
                {finding.sourcePaths.map((p) => (
                  <span key={p} className="ank-finding-src-item">{p}</span>
                ))}
              </span>
            )}
          </Banner>
        ))}
      </div>
    </>
  );

  return { rail, detail };
}
