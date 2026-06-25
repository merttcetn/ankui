/**
 * Bundles-tab counting and bulk-staging helpers.
 *
 * `computeBundleCounts` produces the live `● enabled ○ disabled` counts shown
 * on the Bundles tab, with staged (pending) changes folded in so the UI shows
 * what would be saved on `[s]` rather than stale on-disk state. Keys match
 * BundlesScreen's `tracked:<name>` / `detected:<name>` row lookup.
 *
 * `collectSkillsForBundle` walks every user-scope tool and returns the
 * markdown skills whose `bundleOrigin.name` matches the given bundle. Used by
 * the Bundles-tab `[d]` and `[e]` keys to stage a bulk toggle. Markdown-only
 * since non-markdown skills (MCP servers, commands) have no disable mechanism.
 */

import type {
  MultiProjectScanResult,
  Skill
} from "../../types.js";
import type { BundleRegistry } from "../../bundles/registry.js";
import type { DetectedBundle } from "../../bundles/detect.js";
import type { BundleRowCounts } from "../screens/BundlesScreen.js";
import { isMarkdownSkill, makeDesiredDisabled } from "./actions-items.js";

export function collectSkillsForBundle(
  result: MultiProjectScanResult,
  originName: string
): Skill[] {
  const out: Skill[] = [];
  for (const tool of result.userScope.tools) {
    for (const skill of tool.skills) {
      if (!isMarkdownSkill(skill)) continue;
      const origin = skill.details?.bundleOrigin as
        | { kind: string; name: string }
        | undefined;
      if (!origin) continue;
      if (origin.name !== originName) continue;
      out.push(skill);
    }
  }
  return out;
}

export function computeBundleCounts(
  result: MultiProjectScanResult,
  registry: BundleRegistry,
  detected: DetectedBundle[],
  pending: ReadonlyArray<{ id: string; action: "disable" | "enable" }>
): Map<string, BundleRowCounts> {
  const out = new Map<string, BundleRowCounts>();
  const desired = makeDesiredDisabled(pending);

  const addCount = (key: string, skill: Skill): void => {
    const entry = out.get(key) ?? { enabled: 0, disabled: 0 };
    if (desired(skill)) entry.disabled += 1;
    else entry.enabled += 1;
    out.set(key, entry);
  };

  const trackedNames = new Set(registry.bundles.map((b) => b.name));
  for (const tool of result.userScope.tools) {
    for (const skill of tool.skills) {
      if (!isMarkdownSkill(skill)) continue;
      const origin = skill.details?.bundleOrigin as
        | { kind: string; name: string }
        | undefined;
      if (!origin) continue;
      if (trackedNames.has(origin.name)) {
        addCount(`tracked:${origin.name}`, skill);
      } else if (detected.some((d) => d.name === origin.name)) {
        addCount(`detected:${origin.name}`, skill);
      }
    }
  }
  return out;
}
