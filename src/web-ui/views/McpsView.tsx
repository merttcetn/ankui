import React from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { EMPTY_STATE_WHISPERS } from "../../tui/messages.js";
import {
  aggregateMcps,
  formatCapabilityTag
} from "../../tui/util/mcp-grouping.js";
import { formatInlineOriginLabel } from "../../utils/skill-groups.js";
import { Banner } from "../components/Banner.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail } from "../components/EntityRail.js";
import { SectionLabel } from "../components/SectionLabel.js";
import { SkillRow } from "../components/SkillRow.js";

export function McpsView(props: {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}): { rail: React.ReactNode; detail: React.ReactNode } {
  const groups = aggregateMcps(props.scan);

  if (groups.length === 0) {
    return {
      rail: undefined,
      detail: <div className="empty-whisper">{EMPTY_STATE_WHISPERS.noMcps}</div>
    };
  }

  const selectedId = props.selectedId ?? groups[0]?.name ?? null;
  const selected = groups.find((g) => g.name === selectedId) ?? groups[0];

  const rail = (
    <EntityRail
      sections={[
        {
          heading: "mcp servers",
          items: groups.map((g) => ({
            id: g.name,
            label: g.name,
            count: g.configurations.length,
            pip: g.secretEnvKeys.length > 0 || g.duplicatedAcrossTools ? "warn" : undefined
          }))
        }
      ]}
      selectedId={selectedId}
      onSelect={props.onSelectId}
    />
  );

  const hasSecrets = selected.secretEnvKeys.length > 0;
  const cap = formatCapabilityTag(selected).toUpperCase();
  const cfgCount = selected.configurations.length;
  const meta = `${cap} · ${cfgCount} CONFIGURATION${cfgCount === 1 ? "" : "S"}`;

  const detail = (
    <>
      <DetailHeader
        crumb={`MCPS / ${selected.name.toUpperCase()}`}
        title={selected.name}
        meta={meta}
      />

      {selected.duplicatedAcrossTools && (
        <Banner variant="info" badge="DUPLICATE">
          configured in multiple tools
        </Banner>
      )}
      {hasSecrets && (
        <Banner variant="warn" badge="SECRET">
          secret env keys: {selected.secretEnvKeys.join(", ")}
        </Banner>
      )}

      <SectionLabel count={cfgCount}>configurations</SectionLabel>
      {selected.configurations.map((cfg, i) => {
        const originLabel = formatInlineOriginLabel(cfg.bundleOrigin);
        const src = originLabel
          ? `${cfg.scope} · ${cfg.sourcePath} · ${originLabel}`
          : `${cfg.scope} · ${cfg.sourcePath}`;
        return (
          <SkillRow
            key={`${cfg.toolId}:${cfg.sourcePath}:${i}`}
            pill={{ variant: "muted", label: cfg.toolId.toUpperCase() }}
            name={cfg.toolId}
            source={src}
          />
        );
      })}
    </>
  );

  return { rail, detail };
}
