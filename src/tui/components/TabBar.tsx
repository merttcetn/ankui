import React, { Fragment } from "react";
import { Box, Text } from "ink";

import { HEAVY } from "../theme/borders.js";
import { ACCENT } from "../theme/colors.js";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabBarProps {
  /**
   * Up to two rows of tabs. Row 0 = tools row (Overview + each detected
   * tool). Row 1 = cross-tool views (MCPs, Access, Doctor, Settings).
   */
  rows: ReadonlyArray<ReadonlyArray<TabItem>>;
  /** Which tab id is currently active. */
  activeId: string;
}

const TAB_GAP = "   "; // 3 spaces between tabs

/**
 * Two-row tab bar. Active tab is uppercased and cyan; inactive tabs are
 * dim + regular case. A second visual line per row renders `━` underneath
 * the active label so the cursor of focus is unambiguous.
 */
export function TabBar({ rows, activeId }: TabBarProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {rows.map((row, rowIndex) => (
        <Fragment key={`row-${rowIndex}`}>
          <Box>
            {row.map((tab, tabIndex) => {
              const isActive = tab.id === activeId;
              const displayLabel = isActive ? tab.label.toUpperCase() : tab.label;
              return (
                <Fragment key={tab.id}>
                  {tabIndex > 0 && <Text>{TAB_GAP}</Text>}
                  <Text color={isActive ? ACCENT : undefined} dimColor={!isActive}>
                    {displayLabel}
                  </Text>
                </Fragment>
              );
            })}
          </Box>
          <Box>
            {row.map((tab, tabIndex) => {
              const isActive = tab.id === activeId;
              const displayLabel = isActive ? tab.label.toUpperCase() : tab.label;
              const underline = isActive
                ? HEAVY.horizontal.repeat(displayLabel.length)
                : " ".repeat(displayLabel.length);
              return (
                <Fragment key={`u-${tab.id}`}>
                  {tabIndex > 0 && <Text>{TAB_GAP}</Text>}
                  <Text color={ACCENT}>{underline}</Text>
                </Fragment>
              );
            })}
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}
