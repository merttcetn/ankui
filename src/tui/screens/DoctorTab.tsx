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
import {
  clipHint,
  useAvailableContentRows,
  usePanelWidth
} from "../util/panel-width.js";

export interface DoctorTabProps {
  result: MultiProjectScanResult;
}

export function DoctorTab({ result }: DoctorTabProps): React.ReactElement {
  const board = buildDoctorBoard(result);
  const warningGroups = groupWarningsByReason(result);
  const detectedCount = board.filter((row) => row.detected).length;
  const panelWidth = usePanelWidth();

  const toolBoardRows = board.reduce((n, row) => n + toolRowHeight(row), 0);

  // Fixed overhead before the warnings list:
  //   2 DOCTOR SectionHeader + 1 summary
  // + 1 marginTop + 2 TOOLS SectionHeader + toolBoardRows
  // + 1 marginTop + 2 WARNINGS SectionHeader
  // + 1 hint reservation
  const fixedOverhead = 3 + (3 + toolBoardRows) + 3 + 1;
  const warningsBudget = useAvailableContentRows(fixedOverhead);

  // Clip whole warning groups (don't split a group's children mid-render).
  let usedRows = 0;
  const visibleGroups: WarningGroup[] = [];
  for (const group of warningGroups) {
    const groupRows = 1 + 1 + group.warnings.length; // marginTop + bold header + N warnings
    if (usedRows + groupRows > warningsBudget) break;
    usedRows += groupRows;
    visibleGroups.push(group);
  }
  const hiddenGroups = warningGroups.length - visibleGroups.length;
  const warningsHint = clipHint(hiddenGroups);

  return (
    <Box flexDirection="column">
      <SectionHeader label="DOCTOR" underlineWidth={panelWidth} />
      <Text>
        {board.length} tools · {detectedCount} detected · {result.warnings.length} warnings
      </Text>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="TOOLS" underlineWidth={panelWidth} />
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
          <>
            <WarningsSection
              groups={visibleGroups}
              homeDir={result.homeDir}
              underlineWidth={panelWidth}
            />
            {warningsHint !== null && <Text dimColor>{warningsHint}</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}

function toolRowHeight(row: DoctorToolRow): number {
  if (!row.detected) return 1;
  let h = 1; // header row
  if (row.userPaths.length > 0) h += 1 + row.userPaths.length;
  if (row.projectPaths.length > 0) h += 1 + row.projectPaths.length;
  return h;
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
  underlineWidth: number;
}

function WarningsSection({ groups, homeDir, underlineWidth }: WarningsSectionProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <SectionHeader label="WARNINGS" underlineWidth={underlineWidth} />
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
