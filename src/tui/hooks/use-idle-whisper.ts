import { useCallback, useEffect, useRef, useState } from "react";

import { pickRandomWhisper } from "../messages.js";

export interface UseIdleWhisperOptions {
  enabled: boolean;
  /** ms of inactivity before a roll is attempted. Default 30_000. */
  idleMs?: number;
  /** ms the whisper stays on screen once shown. Default 5_000. */
  lingerMs?: number;
  /** probability [0..1] that an idle tick produces a whisper. Default 0.05. */
  chance?: number;
  /** injectable for tests. Default Math.random. */
  random?: () => number;
}

export interface UseIdleWhisperResult {
  whisper: string | null;
  /** Call from a parent key handler to reset idle timer. */
  bump: () => void;
}

export function useIdleWhisper(
  opts: UseIdleWhisperOptions
): UseIdleWhisperResult {
  const idleMs = opts.idleMs ?? 30_000;
  const lingerMs = opts.lingerMs ?? 5_000;
  const chance = opts.chance ?? 0.05;
  const random = opts.random ?? Math.random;

  const [whisper, setWhisper] = useState<string | null>(null);
  const whisperRef = useRef<string | null>(null);
  const lastBumpRef = useRef<number>(Date.now());
  const clearTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    lastBumpRef.current = Date.now();
    if (clearTimeoutIdRef.current !== null) {
      clearTimeout(clearTimeoutIdRef.current);
      clearTimeoutIdRef.current = null;
    }
    whisperRef.current = null;
    setWhisper(null);
  }, []);

  useEffect(() => {
    if (!opts.enabled) {
      whisperRef.current = null;
      setWhisper(null);
      return;
    }
    // Use a short tick that respects idleMs; in tests idleMs is small so this
    // converges quickly. In production idleMs=30s; we tick every idleMs.
    const tickMs = Math.max(5, Math.min(idleMs, 1_000));
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastBumpRef.current;
      if (elapsed < idleMs) return;
      // Idle threshold passed. Roll the dice — but only if no whisper is
      // currently displayed (avoid stacking).
      if (whisperRef.current !== null) return;
      if (random() >= chance) {
        // Missed roll — push the next attempt one full idle window out so we
        // don't spam every tick.
        lastBumpRef.current = now;
        return;
      }
      const pick = pickRandomWhisper(random);
      whisperRef.current = pick;
      setWhisper(pick);
      clearTimeoutIdRef.current = setTimeout(() => {
        whisperRef.current = null;
        setWhisper(null);
        // Reset idle clock so the next whisper waits a full idle window.
        lastBumpRef.current = Date.now();
        clearTimeoutIdRef.current = null;
      }, lingerMs);
    }, tickMs);

    return () => {
      clearInterval(id);
      if (clearTimeoutIdRef.current !== null) {
        clearTimeout(clearTimeoutIdRef.current);
        clearTimeoutIdRef.current = null;
      }
    };
  }, [opts.enabled, idleMs, lingerMs, chance, random]);

  return { whisper, bump };
}
