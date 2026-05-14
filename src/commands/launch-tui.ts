import { loadAllScans, readDevRootsConfig } from "../scanner/multi-project.js";
import type { MultiProjectScanResult } from "../types.js";

export interface BuildLaunchTuiResultOptions {
  homeDir: string;
  env: Record<string, string | undefined>;
  now?: Date;
}

/**
 * Builds the `MultiProjectScanResult` that `launchTui` passes to `renderTui`.
 *
 * When `~/.config/ankui/config.json` has no `devRoots` registered yet, we skip
 * the expensive user-scope scan (which is the bulk of first-run wall time) and
 * return an empty result. The TUI's first-run screen handles this state without
 * needing populated scan data; the discovery splash is the right next step.
 */
export async function buildLaunchTuiResult(
  options: BuildLaunchTuiResultOptions
): Promise<MultiProjectScanResult> {
  const now = options.now ?? new Date();
  const config = await readDevRootsConfig(options.homeDir);

  if (config.devRoots.length === 0) {
    return {
      scannedAt: now.toISOString(),
      cwd: options.homeDir,
      homeDir: options.homeDir,
      devRoots: [],
      userScope: {
        scannedAt: now.toISOString(),
        cwd: options.homeDir,
        homeDir: options.homeDir,
        tools: [],
        findings: [],
        warnings: [],
        summary: {
          detectedTools: 0,
          totalSkills: 0,
          totalMcpServers: 0,
          uniqueMcpServers: 0,
          customCommands: 0,
          customTools: 0,
          plugins: 0,
          memoryFiles: 0,
          agentSkills: 0,
          skillsShSkills: 0,
          totalFindings: 0,
          broadAccessFindings: 0
        }
      },
      projects: [],
      warnings: config.warnings,
      totals: { projectCount: 0, skillsAcrossProjects: 0, userScopeSkills: 0 }
    };
  }

  return loadAllScans({
    devRoots: config.devRoots,
    homeDir: options.homeDir,
    env: options.env,
    now
  });
}
