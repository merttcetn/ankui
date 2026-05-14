import React from "react";
import { Box, Text } from "ink";

export interface IdleWhisperProps {
  whisper: string | null;
}

/**
 * Renders the idle whisper in a right-justified row.
 * The App-level container is expected to mount this near the bottom of the
 * frame; the box's own justifyContent="flex-end" handles the right edge.
 * If whisper is null, renders an empty Box (no text).
 */
export function IdleWhisper({
  whisper
}: IdleWhisperProps): React.ReactElement {
  return (
    <Box justifyContent="flex-end">
      {whisper === null ? (
        <Text> </Text>
      ) : (
        <Text dimColor italic>
          {whisper}
        </Text>
      )}
    </Box>
  );
}
