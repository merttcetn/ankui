import type { MultiProjectScanResult, ScanResult, ToolId } from "../types.js";
import type { BundleOrigin } from "../scanner/bundle-origin.js";

/**
 * A bundle that the scanner detected on disk but is NOT in the ankui registry.
 * Examples: gstack and superpowers installed by their own installers, plugins
 * from the Claude marketplace cache, builtins shipped inside the tool CLI.
 *
 * Differs from a registry entry: no SHA, no install/update lifecycle — read-only
 * surfacing so users see what's actually loaded.
 */
export interface DetectedBundle {
  /** "<owner>/<repo>" for bundles, "<tool>" for builtins, etc. */
  name: string;
  kind: BundleOrigin["kind"];
  rootPath?: string;
  /** Total markdown skills the scanner saw under this origin. */
  totalSkills: number;
  /** Per-tool count, sorted by toolId for deterministic output. */
  perTool: Array<{ toolId: ToolId; count: number }>;
}

/**
 * Walks a scan result and groups skills by `details.bundleOrigin`. Skills with
 * `kind === "yours"` (the default for un-tagged origins) are excluded —
 * "your own" skills aren't a bundle.
 *
 * `trackedNames` is the set of bundle names already in the ankui registry. Those
 * are filtered out so the caller can render Tracked + Detected as a disjoint list.
 */
export function detectBundlesFromScan(
  scan: MultiProjectScanResult | ScanResult,
  trackedNames: ReadonlySet<string>
): DetectedBundle[] {
  const tools = "userScope" in scan ? scan.userScope.tools : scan.tools;
  type Acc = { origin: BundleOrigin; perTool: Map<ToolId, number> };
  const groups = new Map<string, Acc>();

  for (const tool of tools) {
    for (const skill of tool.skills) {
      const origin = skill.details?.bundleOrigin as BundleOrigin | undefined;
      if (!origin || origin.kind === "yours") continue;
      if (trackedNames.has(origin.name)) continue;
      const key = `${origin.kind} ${origin.name}`;
      const entry = groups.get(key);
      if (entry) {
        entry.perTool.set(tool.id, (entry.perTool.get(tool.id) ?? 0) + 1);
      } else {
        groups.set(key, { origin, perTool: new Map([[tool.id, 1]]) });
      }
    }
  }

  const out: DetectedBundle[] = [];
  for (const { origin, perTool } of groups.values()) {
    const perToolSorted = Array.from(perTool.entries())
      .map(([toolId, count]) => ({ toolId, count }))
      .sort((a, b) => a.toolId.localeCompare(b.toolId));
    const totalSkills = perToolSorted.reduce((s, t) => s + t.count, 0);
    out.push({
      name: origin.name,
      kind: origin.kind,
      rootPath: origin.rootPath,
      totalSkills,
      perTool: perToolSorted
    });
  }

  return out.sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind);
    return a.name.localeCompare(b.name);
  });
}

function kindOrder(kind: BundleOrigin["kind"]): number {
  switch (kind) {
    case "bundle": return 0;
    case "plugin": return 1;
    case "builtin": return 2;
    case "external": return 3;
    case "yours": return 4;
  }
}
