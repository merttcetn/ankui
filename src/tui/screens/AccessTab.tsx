import React from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult } from "../../types.js";
import { AccessViewport } from "../components/AccessViewport.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";
import { aggregateFindings } from "../util/finding-grouping.js";

export interface AccessTabProps {
  result: MultiProjectScanResult;
  /** Active finding index (0-based) within the flattened sections list.
   *  App drives this via the shared `listCursor`; defaults to 0 so older
   *  callers that haven't been updated still render. */
  cursor?: number;
  /** Passthrough for the viewport's window size. Tests set this to render
   *  more than the production default; production callers should leave it
   *  undefined so the bounded default keeps the frame compact. */
  visibleCount?: number;
}

export function AccessTab({
  result,
  cursor = 0,
  visibleCount
}: AccessTabProps): React.ReactElement {
  const sections = aggregateFindings(result);

  if (sections.length === 0) {
    return (
      <Box flexDirection="column">
        <SectionHeader label="ACCESS" />
        <Text dimColor>No findings.</Text>
        <Box marginTop={1}>
          <EmptyStateWhisper text={EMPTY_STATE_WHISPERS.noFindings} />
        </Box>
      </Box>
    );
  }

  const total = sections.reduce((n, s) => n + s.findings.length, 0);
  const breakdown = sections
    .map((s) => `${s.findings.length} ${s.category}`)
    .join(" · ");

  return (
    <Box flexDirection="column">
      <SectionHeader label="ACCESS" />
      <Text>
        {total} findings ({breakdown})
      </Text>
      <AccessViewport
        sections={sections}
        homeDir={result.homeDir}
        cursor={cursor}
        visibleCount={visibleCount}
      />
    </Box>
  );
}
