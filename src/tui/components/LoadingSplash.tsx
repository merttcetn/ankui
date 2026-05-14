import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

import { SCAN_COMPLETE } from "../messages.js";
import { useRotatingMessage } from "../hooks/use-rotating-message.js";
import { ProgressBar } from "./ProgressBar.js";
import { Spinner } from "./Spinner.js";

export interface LoadingSplashProps {
  /** True while scanning. When false + completed=true, shows SCAN_COMPLETE. */
  active: boolean;
  /** Shows SCAN_COMPLETE when active=false. */
  completed?: boolean;
  /** Rotation interval forwarded to useRotatingMessage. */
  intervalMs?: number;
  /** Optional 0..100 progress. */
  percent?: number;
}

const SPINNER_FRAME_INTERVAL_MS = 100;
const PROGRESS_BAR_WIDTH = 28;

export function LoadingSplash(props: LoadingSplashProps): React.ReactElement {
  const { message } = useRotatingMessage({
    active: props.active,
    intervalMs: props.intervalMs
  });
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!props.active) return;
    const id = setInterval(
      () => setFrame((f) => f + 1),
      SPINNER_FRAME_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [props.active]);

  if (!props.active && props.completed) {
    return (
      <Box>
        <Text>{SCAN_COMPLETE}</Text>
      </Box>
    );
  }

  const percent = props.percent;
  return (
    <Box flexDirection="column">
      <Spinner frame={frame} label={message} />
      {typeof percent === "number" && (
        <Box marginTop={1}>
          <ProgressBar
            value={Math.max(0, Math.min(1, percent / 100))}
            width={PROGRESS_BAR_WIDTH}
          />
          <Text>{`  ${Math.round(percent)}%`}</Text>
        </Box>
      )}
    </Box>
  );
}
