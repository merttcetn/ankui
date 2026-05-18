import type { ToolId } from "../types.js";

export interface SessionAction {
  toolId: ToolId;
  name: string;
  action: "disable" | "enable";
}

export interface SessionSummary {
  netDisabled: Array<{ toolId: ToolId; name: string }>;
  netEnabled: Array<{ toolId: ToolId; name: string }>;
}

/**
 * Collapses a chronological action log into a net summary. For each
 * (toolId, name) pair, `disable` counts +1 and `enable` counts -1; the
 * sign of the running total decides which list the skill lands in.
 * A pair that cancels out (net 0) is omitted entirely — the user
 * toggled it both ways in the same session and nothing actually
 * changed on disk.
 */
export function computeSessionSummary(actions: ReadonlyArray<SessionAction>): SessionSummary {
  const tally = new Map<string, { toolId: ToolId; name: string; net: number }>();
  for (const a of actions) {
    const key = `${a.toolId}::${a.name}`;
    const entry = tally.get(key) ?? { toolId: a.toolId, name: a.name, net: 0 };
    entry.net += a.action === "disable" ? 1 : -1;
    tally.set(key, entry);
  }
  const netDisabled: Array<{ toolId: ToolId; name: string }> = [];
  const netEnabled: Array<{ toolId: ToolId; name: string }> = [];
  for (const v of tally.values()) {
    if (v.net > 0) netDisabled.push({ toolId: v.toolId, name: v.name });
    else if (v.net < 0) netEnabled.push({ toolId: v.toolId, name: v.name });
  }
  return { netDisabled, netEnabled };
}

/**
 * Renders the summary as a stdout-friendly multi-line string. Returns
 * the empty string when there's nothing to report — caller MUST skip
 * the print in that case so a quiet session stays quiet.
 */
export function formatSessionSummary(summary: SessionSummary): string {
  if (summary.netDisabled.length === 0 && summary.netEnabled.length === 0) {
    return "";
  }
  const lines: string[] = [];
  if (summary.netDisabled.length > 0) {
    lines.push(`Disabled (${summary.netDisabled.length}):`);
    for (const s of summary.netDisabled) {
      lines.push(`  ○ ${s.toolId}/${s.name}`);
    }
  }
  if (summary.netEnabled.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Enabled (${summary.netEnabled.length}):`);
    for (const s of summary.netEnabled) {
      lines.push(`  ● ${s.toolId}/${s.name}`);
    }
  }
  return lines.join("\n");
}
