import React from "react";
import { Box, Text } from "ink";

export interface SearchBoxProps {
  query: string;
}

export function SearchBox({ query }: SearchBoxProps): React.ReactElement {
  return (
    <Box>
      <Text>/</Text>
      {query.length === 0 ? (
        <Text dimColor>type to filter · esc to close</Text>
      ) : (
        <Text>{query}</Text>
      )}
    </Box>
  );
}
