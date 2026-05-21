import React, { Fragment } from "react";
import { Box, Text } from "ink";

import { LIGHT } from "../theme/borders.js";
import { ACCENT } from "../theme/colors.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";

export interface TabItem {
  id: string;
  label: string;
}

export interface SidebarSection {
  label: string;
  items: ReadonlyArray<TabItem>;
}

export interface SidebarProps {
  sections: ReadonlyArray<SidebarSection>;
  activeId: string;
  /**
   * "sidebar" => active row gets the loud cyan UPPERCASE + ▶ treatment.
   * "panel"   => active row stays cyan but lowercase, no prefix — visual
   *              hand-off cue that interaction has moved to the right pane.
   */
  focus: "sidebar" | "panel";
}

const SIDEBAR_WIDTH = 22;

/**
 * Two-section vertical navigator. Renders inside a Box with a bold right
 * border that doubles as the divider between sidebar and main panel.
 */
export function Sidebar({ sections, activeId, focus }: SidebarProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width={SIDEBAR_WIDTH}
      borderStyle="bold"
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
      borderRight={true}
      paddingRight={1}
    >
      {sections.map((section, sectionIndex) => (
        <Fragment key={section.label}>
          {sectionIndex > 0 && <Box height={1} />}
          <Text color={ACCENT}>{section.label}</Text>
          <Text color={ACCENT}>{LIGHT.horizontal.repeat(section.label.length)}</Text>
          {section.items.map((item) => (
            <SidebarRow
              key={item.id}
              item={item}
              isActive={item.id === activeId}
              focus={focus}
            />
          ))}
        </Fragment>
      ))}
    </Box>
  );
}

interface SidebarRowProps {
  item: TabItem;
  isActive: boolean;
  focus: "sidebar" | "panel";
}

function SidebarRow({ item, isActive, focus }: SidebarRowProps): React.ReactElement {
  if (!isActive) {
    return (
      <Text dimColor>{`  ${item.label}`}</Text>
    );
  }
  if (focus === "sidebar") {
    return (
      <Text color={ACCENT}>{`${ACTIVE_PREFIX} ${item.label.toUpperCase()}`}</Text>
    );
  }
  return <Text color={ACCENT}>{`  ${item.label}`}</Text>;
}
