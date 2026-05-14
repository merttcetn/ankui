import React, { useReducer, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { MultiProjectScanResult } from "../../types.js";
import { mergeDevRoots } from "../../config/ankui-config.js";
import { relativizeHome } from "../../utils/paths.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { DotLeaderRow } from "../components/DotLeaderRow.js";
import { TextInput } from "../components/TextInput.js";
import { useKeys } from "../input/use-keys.js";
import {
  INITIAL_SETTINGS_STATE,
  settingsReducer
} from "../state/settings-state.js";
import { ACTIVE_PREFIX } from "../theme/icons.js";
import { ACCENT } from "../theme/colors.js";
import { formatLastScan } from "../util/scan-history.js";

export interface SettingsProps {
  result: MultiProjectScanResult;
  onConfigChange: (devRoots: string[]) => Promise<void>;
  onRescan: () => void;
}

export function Settings({
  result,
  onConfigChange,
  onRescan
}: SettingsProps): React.ReactElement {
  const [state, dispatch] = useReducer(settingsReducer, INITIAL_SETTINGS_STATE);
  const [addBuffer, setAddBuffer] = useState("");

  const devRoots = result.devRoots;
  const rootCount = devRoots.length;

  useKeys({
    onArrowUp: () => {
      if (!state.addMode) {
        dispatch({ type: "moveCursor", direction: "up", rootCount });
      }
    },
    onArrowDown: () => {
      if (!state.addMode) {
        dispatch({ type: "moveCursor", direction: "down", rootCount });
      }
    }
  });

  useInput((input, key) => {
    if (state.addMode) {
      // TextInput owns key handling while in add-mode. We listen only for Esc.
      if (key.escape) dispatch({ type: "cancelAddMode" });
      return;
    }
    if (input === "a") {
      setAddBuffer("");
      dispatch({ type: "enterAddMode" });
      return;
    }
    if (input === "d" && rootCount > 0) {
      const next = devRoots.filter((_, idx) => idx !== state.cursor);
      dispatch({ type: "removeAtCursor", newRootCount: next.length });
      void onConfigChange(next);
      return;
    }
    if (input === "r") {
      onRescan();
    }
  });

  const totalSkills =
    result.totals.userScopeSkills + result.totals.skillsAcrossProjects;
  const lastScanLine = formatLastScan({
    scannedAt: result.scannedAt,
    totalSkills
  });

  return (
    <Box flexDirection="column">
      <SectionHeader label="DEV ROOTS" />
      {rootCount === 0 ? (
        <Text dimColor>
          No dev roots registered. Press [a] to add one, or [r] to scan filesystem.
        </Text>
      ) : (
        devRoots.map((root, idx) => {
          const isActive = idx === state.cursor && !state.addMode;
          const display = relativizeHome(root, result.homeDir);
          return (
            <Box key={root}>
              <Text color={isActive ? ACCENT : undefined}>
                {isActive ? `${ACTIVE_PREFIX} ` : "  "}
              </Text>
              <Box width={60}>
                <DotLeaderRow label={display} metadata="" width={60} active={isActive} />
              </Box>
            </Box>
          );
        })
      )}

      {state.addMode && (
        <Box marginTop={1}>
          <Text>add root  </Text>
          <TextInput
            value={addBuffer}
            onChange={setAddBuffer}
            placeholder="/Users/.../code"
            onSubmit={async (value) => {
              const trimmed = value.trim();
              dispatch({ type: "cancelAddMode" });
              if (!trimmed) return;
              const next = mergeDevRoots(devRoots, [trimmed]);
              await onConfigChange(next);
            }}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {"[ a ] add root    [ d ] remove selected    [ r ] re-scan filesystem"}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <SectionHeader label="SCAN HISTORY" />
        <Text>{`last scan · ${lastScanLine}`}</Text>
      </Box>
    </Box>
  );
}
