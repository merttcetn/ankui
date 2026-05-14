import React, { Fragment } from "react";
import { Box, Text } from "ink";

import type { MultiProjectScanResult } from "../../types.js";
import { EmptyStateWhisper } from "../components/EmptyStateWhisper.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { EMPTY_STATE_WHISPERS } from "../messages.js";
import { relativizeHome } from "../../utils/paths.js";
import {
  buildDoctorBoard,
  groupWarningsByReason,
  type DoctorToolRow,
  type WarningGroup
} from "../util/doctor-grouping.js";

export interface DoctorTabProps {
  result: MultiProjectScanResult;
}

export function DoctorTab({ result }: DoctorTabProps): React.ReactElement {
  const board = buildDoctorBoard(result);
  const warningGroups = groupWarningsByReason(result);
  const detectedCount = board.filter((row) => row.detected).length;

  return (
    <Box flexDirection="column">
      <SectionHeader label="DOCTOR" />
      <Text>
        {board.length} tools · {detectedCount} detected · {result.warnings.length} warnings
      </Text>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="TOOLS" />
        {board.map((row) => (
          <ToolBoardRow key={row.toolId} row={row} />
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {warningGroups.length === 0 ? (
          <Box flexDirection="column">
            <Text dimColor>No warnings.</Text>
            <Box marginTop={1}>
              <EmptyStateWhisper text={EMPTY_STATE_WHISPERS.noWarnings} />
            </Box>
          </Box>
        ) : (
          <WarningsSection groups={warningGroups} homeDir={result.homeDir} />
        )}
      </Box>
    </Box>
  );
}

function ToolBoardRow({ row }: { row: DoctorToolRow }): React.ReactElement {
  if (!row.detected) {
    return (
      <Box>
        <Text>{"  - "}</Text>
        <Text bold>{row.name}</Text>
        <Text>      </Text>
        <Text dimColor>not detected</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Box>
        <Text>{"  ✓ "}</Text>
        <Text bold>{row.name}</Text>
      </Box>
      {row.userPaths.length > 0 && (
        <Fragment>
          <Text dimColor>{"      user:"}</Text>
          {row.userPaths.map((path) => (
            <Text key={`u:${path}`}>{`        ${path}`}</Text>
          ))}
        </Fragment>
      )}
      {row.projectPaths.length > 0 && (
        <Fragment>
          <Text dimColor>{"      project:"}</Text>
          {row.projectPaths.map((path) => (
            <Text key={`p:${path}`}>{`        ${path}`}</Text>
          ))}
        </Fragment>
      )}
    </Box>
  );
}

interface WarningsSectionProps {
  groups: ReadonlyArray<WarningGroup>;
  homeDir: string;
}

function WarningsSection({ groups, homeDir }: WarningsSectionProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <SectionHeader label="WARNINGS" />
      {groups.map((group) => (
        <Box key={group.reason} marginTop={1} flexDirection="column">
          <Text bold>
            {group.reason} ({group.warnings.length})
          </Text>
          {group.warnings.map((warning) => (
            <Text key={warning.id} dimColor>
              {"  "}{warning.path ? relativizeHome(warning.path, homeDir) : warning.message}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
