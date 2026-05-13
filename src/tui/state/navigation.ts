export function cycleTabId(
  current: string,
  direction: "next" | "prev",
  tabs: ReadonlyArray<string>
): string {
  if (tabs.length === 0) return current;
  const idx = tabs.indexOf(current);
  if (idx === -1) return tabs[0];
  const step = direction === "next" ? 1 : -1;
  const nextIdx = (idx + step + tabs.length) % tabs.length;
  return tabs[nextIdx];
}
