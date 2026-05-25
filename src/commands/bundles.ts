import { readRegistry, type BundleRegistry } from "../bundles/registry.js";
import { detectBundlesFromScan, type DetectedBundle } from "../bundles/detect.js";
import { scan } from "../scanner/index.js";
import type { CommandResult } from "./add.js";
import type { MultiProjectScanResult } from "../types.js";

export interface BundlesCommandInput {
  homeDir: string;
  flags: { json?: boolean; verbose?: boolean };
  /** Test seam — when provided, used instead of running a real scan. */
  loadScan?: () => Promise<MultiProjectScanResult>;
}

export async function runBundlesCommand(input: BundlesCommandInput): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const reg = await readRegistry(input.homeDir);

  const trackedNames = new Set(reg.bundles.map((b) => b.name));
  let detected: DetectedBundle[] = [];
  try {
    const scanResult = input.loadScan
      ? await input.loadScan()
      : await scanToMultiProject(input.homeDir);
    detected = detectBundlesFromScan(scanResult, trackedNames);
  } catch {
    // scan failure shouldn't break the tracked listing
  }

  if (input.flags.json) {
    stdout.push(JSON.stringify({ version: 1, tracked: reg.bundles, detected }, null, 2));
    return { exitCode: 0, stdout, stderr };
  }

  if (reg.bundles.length === 0 && detected.length === 0) {
    stdout.push("No bundles installed. Use `ankui add <git-url>` to add one.");
    return { exitCode: 0, stdout, stderr };
  }

  if (reg.bundles.length > 0) {
    stdout.push("Tracked (ankui add)");
    for (const b of reg.bundles) {
      const distinctSkills = new Set(b.installs.map((i) => i.skillName)).size;
      const distinctTools = new Set(b.installs.map((i) => i.toolId)).size;
      const scopeLabel = b.scope === "project" ? `project (${b.projectCwd})` : "user";
      stdout.push(`  ${pad(b.name, 24)}  ${distinctSkills} skills × ${distinctTools} tools  pinned ${b.pinnedSha.slice(0, 7)}  ${scopeLabel}`);
    }
    if (input.flags.verbose) {
      for (const b of reg.bundles) {
        stdout.push("");
        stdout.push(`  ${b.name}:`);
        for (const inst of b.installs) {
          stdout.push(`    ${inst.toolId} :: ${inst.symlinkPath}`);
        }
      }
    }
  }

  if (detected.length > 0) {
    if (reg.bundles.length > 0) stdout.push("");
    stdout.push("Detected (manually managed)");
    for (const d of detected) {
      const distinctTools = d.perTool.length;
      const kindLabel = d.kind === "bundle" ? "bundle" : d.kind;
      stdout.push(`  ${pad(d.name, 24)}  ${d.totalSkills} skills × ${distinctTools} tools  ${kindLabel}`);
    }
    if (input.flags.verbose) {
      for (const d of detected) {
        stdout.push("");
        stdout.push(`  ${d.name}:`);
        for (const t of d.perTool) {
          stdout.push(`    ${t.toolId}: ${t.count} skill${t.count === 1 ? "" : "s"}`);
        }
      }
    }
  }

  return { exitCode: 0, stdout, stderr };
}

async function scanToMultiProject(homeDir: string): Promise<MultiProjectScanResult> {
  const stamp = new Date().toISOString();
  const single = await scan({ homeDir });
  return {
    scannedAt: stamp,
    cwd: single.cwd,
    homeDir: single.homeDir,
    devRoots: [],
    userScope: single,
    projects: [],
    warnings: [],
    totals: {
      projectCount: 0,
      skillsAcrossProjects: 0,
      userScopeSkills: single.tools.reduce((s, t) => s + t.skills.length, 0)
    }
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export type { BundleRegistry };
