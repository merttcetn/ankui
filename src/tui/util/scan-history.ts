export interface FormatLastScanInput {
  scannedAt: string;
  totalSkills: number;
  /** Optional IANA timeZone. Tests pin to "UTC" for deterministic output. */
  timeZone?: string;
}

/**
 * Pure formatter for the Settings → Scan History row.
 *
 *   "2026-05-14 00:42 · 273 skills"
 *
 * Returns `"never"` when scannedAt is empty or unparseable so the caller
 * does not have to special-case the empty state.
 */
export function formatLastScan(input: FormatLastScanInput): string {
  if (!input.scannedAt) return "never";
  const date = new Date(input.scannedAt);
  if (Number.isNaN(date.getTime())) return "never";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: input.timeZone
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = normalizeHour(get("hour"));
  const minute = get("minute");

  const skillsLabel = input.totalSkills === 1 ? "skill" : "skills";
  return `${year}-${month}-${day} ${hour}:${minute} · ${input.totalSkills} ${skillsLabel}`;
}

/**
 * Intl.DateTimeFormat with `hour12: false` and `hour: "2-digit"` sometimes
 * emits "24" at midnight in certain ICU versions; we normalize that to "00".
 */
function normalizeHour(raw: string): string {
  if (raw === "24") return "00";
  return raw;
}
