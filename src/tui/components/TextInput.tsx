import React from "react";
import { Text, useInput } from "ink";

export interface TextInputProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}

/**
 * Minimal one-line text input. Captures printable characters, backspace,
 * and return. Arrow keys are ignored so the parent can keep them for
 * selection. The cursor is a trailing `▌` when the buffer has focus.
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder
}: TextInputProps): React.ReactElement {
  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      if (value.length > 0) onChange(value.slice(0, -1));
      return;
    }
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return; // reserved for parent
    }
    if (key.tab || key.escape || key.ctrl || key.meta) {
      return; // reserved for parent
    }
    // Treat any other input as printable. Ink delivers paste/multichar in one
    // call, so concatenate the whole `input` string.
    if (input && input.length > 0) {
      onChange(value + input);
    }
  });

  const displayValue = value.length === 0 ? placeholder ?? "" : value;
  return (
    <Text>
      {value.length === 0 ? <Text dimColor>{displayValue}</Text> : <Text>{displayValue}</Text>}
      <Text color="cyan">▌</Text>
    </Text>
  );
}
