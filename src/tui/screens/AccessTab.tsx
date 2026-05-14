import React, { Fragment } from "react";
import { Box, Text } from "ink";

import type { Finding, MultiProjectScanResult } from "../../types.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";
import { relativizeHome } from "../../utils/paths.js";
import {
  aggregateFindings,
  type FindingSection
} from "../util/finding-grouping.js";

export interface AccessTabProps {
  result: MultiProjectScanResult;
}

export function AccessTab({ result }: AccessTabProps): React.ReactElement {
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

      {sections.map((section) => (
        <FindingSectionBlock
          key={section.category}
          section={section}
          homeDir={result.homeDir}
        />
      ))}
    </Box>
  );
}

interface FindingSectionBlockProps {
  section: FindingSection;
  homeDir: string;
}

function FindingSectionBlock({
  section,
  homeDir
}: FindingSectionBlockProps): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <SectionHeader label={section.label.toUpperCase()} />
      {section.findings.map((finding) => (
        <FindingBlock key={finding.id} finding={finding} homeDir={homeDir} />
      ))}
    </Box>
  );
}

interface FindingBlockProps {
  finding: Finding;
  homeDir: string;
}

function FindingBlock({ finding, homeDir }: FindingBlockProps): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text>{`  • ${finding.title}`}</Text>
      <Text dimColor>{`    Scope: ${finding.scope} · Tools: ${finding.toolIds.join(", ")}`}</Text>
      <Text dimColor>
        {finding.sourcePaths.length === 1 ? "    Source:" : "    Sources:"}
      </Text>
      {finding.sourcePaths.map((sourcePath) => (
        <Fragment key={sourcePath}>
          <Text dimColor>{`      ${relativizeHome(sourcePath, homeDir)}`}</Text>
        </Fragment>
      ))}
      <Text>{`    Recommendation: ${finding.recommendation}`}</Text>
    </Box>
  );
}
