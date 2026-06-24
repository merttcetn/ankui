import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

import { SCAN_COMPLETE } from "../messages.js";
import { useRotatingMessage } from "../hooks/use-rotating-message.js";
import { ACCENT } from "../theme/colors.js";
import { DISCLOSURE_CLOSED, DISCLOSURE_OPEN, SPLASH_DOT } from "../theme/icons.js";
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
const PANEL_WIDTH = 64;
const PROGRESS_BAR_WIDTH = 34;
const TRACE_WIDTH = 34;

const SIGNALS = [
  "locating config roots",
  "reading tool manifests",
  "linking MCP access"
] as const;

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
      <Box
        flexDirection="column"
        width={PANEL_WIDTH}
        borderStyle="bold"
        paddingX={2}
        paddingY={1}
      >
        <SplashHeader />
        <Box marginTop={1}>
          <Text color={ACCENT}>{DISCLOSURE_OPEN}</Text>
          <Text>{`  ${SCAN_COMPLETE}`}</Text>
        </Box>
      </Box>
    );
  }

  const percent = props.percent;
  const activeSignal = Math.floor(frame / 8) % SIGNALS.length;
  return (
    <Box
      flexDirection="column"
      width={PANEL_WIDTH}
      borderStyle="bold"
      paddingX={2}
      paddingY={1}
    >
      <SplashHeader />

      <Box marginTop={1}>
        <Spinner frame={frame} label={message} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        {SIGNALS.map((label, index) => (
          <SignalRow
            key={label}
            label={label}
            active={index === activeSignal}
          />
        ))}
      </Box>

      <Box marginTop={1}>
        {typeof percent === "number" ? (
          <>
          <ProgressBar
            value={Math.max(0, Math.min(1, percent / 100))}
            width={PROGRESS_BAR_WIDTH}
          />
          <Text>{`  ${Math.round(percent)}%`}</Text>
          </>
        ) : (
          <Text color={ACCENT}>{buildTrace(frame)}</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>local files only · read-only scans</Text>
      </Box>
    </Box>
  );
}

function SplashHeader(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ACCENT}>{SPLASH_DOT}</Text>
        <Text bold>{"  ankui"}</Text>
        <Text dimColor>{"  / memory scan"}</Text>
      </Box>
      <Text dimColor>remember what your agents can access</Text>
    </Box>
  );
}

function SignalRow({
  label,
  active
}: {
  label: string;
  active: boolean;
}): React.ReactElement {
  return (
    <Box>
      <Text color={active ? ACCENT : undefined}>
        {active ? DISCLOSURE_OPEN : DISCLOSURE_CLOSED}
      </Text>
      <Text>{`  ${label}`}</Text>
      <Text dimColor>{active ? "  scanning" : "  queued"}</Text>
    </Box>
  );
}

function buildTrace(frame: number): string {
  const head = frame % TRACE_WIDTH;
  return Array.from({ length: TRACE_WIDTH }, (_, index) => {
    const distance = (index - head + TRACE_WIDTH) % TRACE_WIDTH;
    if (distance < 4) return "━";
    if (distance < 7) return "╍";
    return "·";
  }).join("");
}
