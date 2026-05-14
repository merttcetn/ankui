import { useEffect, useMemo, useState } from "react";

import { REMEMBER_MESSAGES, shuffleRemainder } from "../messages.js";

export interface UseRotatingMessageOptions {
  /** When false, hook holds at index 0 ("Remembering..."). */
  active: boolean;
  /** Rotation interval in ms. Default 2500. */
  intervalMs?: number;
  /** Injectable randomness for tests. Default Math.random. */
  random?: () => number;
}

export interface UseRotatingMessageResult {
  message: string;
  index: number;
}

/**
 * Rotates through REMEMBER_MESSAGES:
 *   - index 0 ("Remembering...") always shown first
 *   - index 1 ("Anghkooey.") always shown second
 *   - indices 2..N shuffled deterministically once per active-cycle
 * Caller toggles `active` to start/stop rotation.
 */
export function useRotatingMessage(
  opts: UseRotatingMessageOptions
): UseRotatingMessageResult {
  const intervalMs = opts.intervalMs ?? 2500;
  const random = opts.random ?? Math.random;

  // Build the rotation order once per `active` flip, so a single scan
  // session sees a stable sequence (no re-shuffles per render).
  const sequence = useMemo(
    () => shuffleRemainder(REMEMBER_MESSAGES, 2, random),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.active]
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!opts.active) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % sequence.length);
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [opts.active, intervalMs, sequence.length]);

  const message = sequence[index] ?? REMEMBER_MESSAGES[0];
  return { message, index };
}
