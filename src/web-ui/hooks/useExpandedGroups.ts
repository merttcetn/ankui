import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "ankui:expanded-groups:";

/**
 * Tracks which group labels are user-expanded for a given surface (e.g.
 * "actions", "tools"). Persisted to localStorage so state survives page
 * reload. The set intentionally stores labels that diverge from their
 * default — yours-always-expanded groups never enter the set; non-yours
 * groups enter when expanded.
 */
export function useExpandedGroups(surface: string): {
  isExpanded: (label: string, alwaysExpanded: boolean) => boolean;
  toggle: (label: string) => void;
} {
  const storageKey = `${STORAGE_PREFIX}${surface}`;
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    loadFromStorage(storageKey)
  );

  useEffect(() => {
    saveToStorage(storageKey, expanded);
  }, [storageKey, expanded]);

  const isExpanded = useCallback(
    (label: string, alwaysExpanded: boolean) =>
      alwaysExpanded || expanded.has(label),
    [expanded]
  );

  const toggle = useCallback((label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  return { isExpanded, toggle };
}

function loadFromStorage(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveToStorage(key: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable / quota / private mode — silently degrade
  }
}
