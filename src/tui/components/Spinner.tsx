import React from "react";
import { Text } from "ink";

import { SPINNER_FRAMES } from "../theme/icons.js";

export interface SpinnerProps {
  /**
   * Current frame index (0..9). Out-of-range values are wrapped via modulo.
   * Parent owns the interval timer (e.g., setInterval(100ms) → setFrame(f+1)).
   */
  frame: number;
  /** Optional label rendered after the braille glyph, e.g., "Remembering...". */
  label?: string;
}

export function Spinner({ frame, label }: SpinnerProps): React.ReactElement {
  const idx = mod(frame, SPINNER_FRAMES.length);
  const glyph = SPINNER_FRAMES[idx];
  return (
    <Text>
      {glyph}
      {label !== undefined ? `   ${label}` : ""}
    </Text>
  );
}

/** JS `%` is sign-preserving; we want a true modulo for negative frames. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
