import React from "react";
import { Box, Text } from "ink";

import type { ScanResult } from "../types.js";

export interface AppProps {
  result: ScanResult;
}

export function App({ result }: AppProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Ankui</Text>
      <Text>Detected tools: {result.summary.detectedTools}</Text>
      <Text>Interactive TUI is not implemented yet.</Text>
    </Box>
  );
}
