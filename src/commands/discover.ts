import os from "node:os";

import {
  getAnkuiConfigPath,
  mergeDevRoots,
  readAnkuiConfig,
  writeAnkuiConfig
} from "../config/ankui-config.js";
import {
  crawlForProjects,
  type FoundProject
} from "../scanner/filesystem-crawler.js";
import {
  groupProjectsByParent,
  selectDefaultOnRoots,
  type DevRootCandidate
} from "../scanner/project-discovery.js";
import { relativizeHome } from "../utils/paths.js";
import type { Warning } from "../types.js";

export interface DiscoverCommandOptions {
  apply: boolean;
  json: boolean;
  write: (chunk: string) => void;
  homeDir?: string;
  now?: () => Date;
}

export async function runDiscoverCommand(options: DiscoverCommandOptions): Promise<void> {
  const homeDir = options.homeDir ?? os.homedir();
  const now = options.now ?? (() => new Date());
  const scannedAt = now().toISOString();
  const configPath = getAnkuiConfigPath(homeDir);

  const crawl = await crawlForProjects({ rootDir: homeDir });
  const candidates = groupProjectsByParent(crawl.projects);

  let applied = false;
  let previousDevRoots: string[] = [];
  let nextDevRoots: string[] = [];
  let writeOutcome: "wrote" | "no-op" | "skipped" = "skipped";

  if (options.apply) {
    const existing = await readAnkuiConfig(homeDir);
    previousDevRoots = existing.config.devRoots;
    const merged = mergeDevRoots(previousDevRoots, selectDefaultOnRoots(candidates));

    const unchanged =
      merged.length === previousDevRoots.length &&
      merged.every((entry, idx) => entry === previousDevRoots[idx]);

    if (unchanged) {
      writeOutcome = "no-op";
      nextDevRoots = previousDevRoots;
    } else {
      await writeAnkuiConfig({ version: 1, devRoots: merged }, homeDir);
      writeOutcome = "wrote";
      nextDevRoots = merged;
    }
    applied = true;
  }

  if (options.json) {
    options.write(
      `${JSON.stringify(
        {
          scannedAt,
          homeDir,
          configPath,
          stats: {
            pathsVisited: crawl.stats.pathsVisited,
            durationMs: crawl.stats.durationMs,
            projectsFound: crawl.projects.length
          },
          candidates: candidates.map((c) => ({
            parentPath: c.parentPath,
            displayPath: relativizeHome(c.parentPath, homeDir),
            projectCount: c.projectCount,
            projectPaths: c.projectPaths,
            defaultOn: c.defaultOn
          })),
          warnings: crawl.warnings,
          applied,
          previousDevRoots: applied ? previousDevRoots : [],
          nextDevRoots: applied ? nextDevRoots : []
        },
        null,
        2
      )}\n`
    );
    return;
  }

  options.write(`${formatDiscoverHuman({
    crawlStats: crawl.stats,
    crawlProjects: crawl.projects,
    candidates,
    homeDir,
    apply: options.apply,
    writeOutcome,
    previousDevRoots,
    nextDevRoots,
    configPath
  })}\n`);
}

function formatDiscoverHuman(args: {
  crawlStats: { pathsVisited: number; durationMs: number };
  crawlProjects: readonly FoundProject[];
  candidates: readonly DevRootCandidate[];
  homeDir: string;
  apply: boolean;
  writeOutcome: "wrote" | "no-op" | "skipped";
  previousDevRoots: readonly string[];
  nextDevRoots: readonly string[];
  configPath: string;
}): string {
  const seconds = (args.crawlStats.durationMs / 1000).toFixed(2);
  const pathsVisited = args.crawlStats.pathsVisited.toLocaleString("en-US");
  const header = `Ankui discover — crawl of ~ in ${seconds}s, ${pathsVisited} paths visited, ${args.crawlProjects.length} projects found`;

  if (args.candidates.length === 0) {
    return `${header}\n\nNo projects found. Either no AI tools are configured, or the crawl was constrained by the skip list. Try running scan in a specific project directory.`;
  }

  const defaultOn = args.candidates.filter((c) => c.defaultOn);
  const suggested = args.candidates.filter((c) => !c.defaultOn);

  const sections: string[] = [];

  if (defaultOn.length === 0) {
    sections.push("No dev roots found with 3+ projects.");
  } else {
    sections.push(
      [
        `Default-ON dev roots (${defaultOn.length})`,
        "────────────────────────",
        ...defaultOn.map((c) => formatCandidateRow(c, args.homeDir, "●"))
      ].join("\n")
    );
  }

  if (suggested.length > 0) {
    sections.push(
      [
        `Suggested (1-2 projects, off by default)`,
        "────────────────────────────────────────",
        ...suggested.map((c) => formatCandidateRow(c, args.homeDir, "○"))
      ].join("\n")
    );
  }

  let footer: string;
  if (!args.apply) {
    const displayConfig = relativizeHome(args.configPath, args.homeDir);
    footer = `No changes applied. Re-run with --apply to register the default-ON roots in ${displayConfig}.`;
  } else if (args.writeOutcome === "no-op") {
    footer = `Config already up to date — no changes written.`;
  } else {
    const added = args.nextDevRoots.length - args.previousDevRoots.length;
    const kept = args.previousDevRoots.length;
    const displayConfig = relativizeHome(args.configPath, args.homeDir);
    footer = `Wrote ${args.nextDevRoots.length} dev root(s) to ${displayConfig} (added ${added}, kept ${kept}).`;
  }

  return [header, "", sections.join("\n\n"), "", footer].join("\n");
}

function formatCandidateRow(
  candidate: DevRootCandidate,
  homeDir: string,
  icon: string
): string {
  const display = relativizeHome(candidate.parentPath, homeDir).padEnd(38);
  return `${icon}  ${display} ${plural(candidate.projectCount, "project")}`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

// Re-export the type so test files don't need to import from two paths.
export type { Warning };
