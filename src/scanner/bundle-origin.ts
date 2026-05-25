import type {
  AITool,
  MultiProjectScanResult,
  ProjectScan,
  ScanResult,
  Skill
} from "../types.js";

export type BundleKind = "bundle" | "plugin" | "builtin" | "yours" | "external";

export interface BundleOrigin {
  kind: BundleKind;
  /** gstack | superpowers | claude | yours | external | <owner>/<repo> */
  name: string;
  /** ~/gstack | ~/.claude/plugins/cache/<mp>/<plugin>/<version> (undefined for yours/builtin/external) */
  rootPath?: string;
}

const PLUGIN_CACHE_MARKER = "/.claude/plugins/cache/";
const ANKUI_BUNDLES_PREFIX = "~/.ankui/bundles/";

/**
 * Pure per-skill origin detection. No filesystem I/O — relies on existing
 * skill.sourcePath (absolute) and skill.details.linkTarget (already in ~/ form).
 *
 * Rules (first match wins):
 *   1. source === "builtin" → builtin
 *   2. sourcePath under ~/.claude/plugins/cache/<mp>/<plugin>/<version>/... → plugin
 *   3. linkTarget ~/.ankui/bundles/<owner>/<repo>/... → bundle (owner/repo)
 *   4. linkTarget ~/<segment>/... → bundle (segment)
 *   5. linkTarget exists but not ~/ → external
 *   6. default → yours
 */
export function detectBundleOrigin(skill: Skill): BundleOrigin {
  // Rule 1: builtin
  if (skill.source === "builtin") {
    return { kind: "builtin", name: skill.toolId };
  }

  // Rule 2: plugin marketplace cache
  const pluginOrigin = detectPluginOrigin(skill.sourcePath);
  if (pluginOrigin) {
    return pluginOrigin;
  }

  const linkTarget = readLinkTarget(skill);

  if (linkTarget) {
    // Rule 3: ankui bundles special case (must run before generic ~/ rule)
    if (linkTarget.startsWith(ANKUI_BUNDLES_PREFIX)) {
      const remainder = linkTarget.slice(ANKUI_BUNDLES_PREFIX.length);
      const segments = remainder.split("/").filter((segment) => segment.length > 0);
      if (segments.length >= 2) {
        const owner = segments[0];
        const repo = segments[1];
        return {
          kind: "bundle",
          name: `${owner}/${repo}`,
          rootPath: `${ANKUI_BUNDLES_PREFIX}${owner}/${repo}`
        };
      }
    }

    // Rule 4: general ~/<segment>/... bundle
    if (linkTarget.startsWith("~/")) {
      const remainder = linkTarget.slice(2);
      const firstSegment = remainder.split("/").find((segment) => segment.length > 0);
      if (firstSegment) {
        return {
          kind: "bundle",
          name: firstSegment,
          rootPath: `~/${firstSegment}`
        };
      }
    }

    // Rule 5: external linkTarget (defensive — Phase 5 safety rejects out-of-home symlinks)
    return { kind: "external", name: "external" };
  }

  // Rule 6: default
  return { kind: "yours", name: "yours" };
}

function detectPluginOrigin(sourcePath: string): BundleOrigin | undefined {
  const markerIndex = sourcePath.indexOf(PLUGIN_CACHE_MARKER);
  if (markerIndex === -1) {
    return undefined;
  }

  const after = sourcePath.slice(markerIndex + PLUGIN_CACHE_MARKER.length);
  const segments = after.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 3) {
    return undefined;
  }

  const [marketplace, plugin, version] = segments;
  // PLUGIN_CACHE_MARKER already starts with "/.claude/...", so prefixing "~"
  // yields "~/.claude/plugins/cache/<mp>/<plugin>/<version>" directly.
  const displayRoot = `~${PLUGIN_CACHE_MARKER}${marketplace}/${plugin}/${version}`;

  return {
    kind: "plugin",
    name: plugin,
    rootPath: displayRoot
  };
}

function readLinkTarget(skill: Skill): string | undefined {
  const raw = skill.details?.linkTarget;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Enrich each skill in-place by writing details.bundleOrigin. Returns the same
 * skills array reference (mirrors the in-place mutation style of enrichSkill in
 * capability-map.ts). Safe to re-run — recomputes from scratch, no accumulation.
 */
export function enrichSkillsWithBundleOrigin(skills: Skill[]): Skill[] {
  for (const skill of skills) {
    const origin = detectBundleOrigin(skill);
    skill.details = { ...(skill.details ?? {}), bundleOrigin: origin };
  }
  return skills;
}

/**
 * Enrich a single-scan result. Returns a new outer object (new tools array,
 * new tool entries, new skills arrays) so callers can swap state safely.
 */
export function enrichScanResultWithBundleOrigin(result: ScanResult): ScanResult {
  const tools: AITool[] = result.tools.map((tool) => ({
    ...tool,
    skills: enrichSkillsWithBundleOrigin([...tool.skills])
  }));
  return { ...result, tools };
}

/**
 * Enrich a multi-project result by enriching userScope plus every project scan.
 * Provided as a convenience helper for later slices — not wired into scan().
 */
export function enrichMultiProjectWithBundleOrigin(
  result: MultiProjectScanResult
): MultiProjectScanResult {
  const userScope = enrichScanResultWithBundleOrigin(result.userScope);
  const projects: ProjectScan[] = result.projects.map((project) => ({
    ...project,
    scan: enrichScanResultWithBundleOrigin(project.scan)
  }));
  return { ...result, userScope, projects };
}
