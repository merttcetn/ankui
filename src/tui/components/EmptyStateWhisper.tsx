import React from "react";
import { Text } from "ink";

export interface EmptyStateWhisperProps {
  text: string;
}

export function EmptyStateWhisper({
  text
}: EmptyStateWhisperProps): React.ReactElement {
  return (
    <Text dimColor italic>
      {text}
    </Text>
  );
}
