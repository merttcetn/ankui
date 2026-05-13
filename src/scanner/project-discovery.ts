import type { FoundProject } from "./filesystem-crawler.js";

export const MIN_PROJECTS_FOR_DEFAULT_ON = 3;

export interface DevRootCandidate {
  parentPath: string;
  projectCount: number;
  projectPaths: string[];
  defaultOn: boolean;
}

export function groupProjectsByParent(
  projects: readonly FoundProject[]
): DevRootCandidate[] {
  const byParent = new Map<string, string[]>();

  for (const project of projects) {
    const list = byParent.get(project.parentPath) ?? [];
    list.push(project.projectPath);
    byParent.set(project.parentPath, list);
  }

  const candidates: DevRootCandidate[] = [];
  for (const [parentPath, projectPaths] of byParent) {
    candidates.push({
      parentPath,
      projectCount: projectPaths.length,
      projectPaths,
      defaultOn: false
    });
  }

  candidates.sort((a, b) => {
    if (b.projectCount !== a.projectCount) {
      return b.projectCount - a.projectCount;
    }
    return a.parentPath.localeCompare(b.parentPath);
  });

  return applyDefaultOnHeuristic(candidates);
}

export function applyDefaultOnHeuristic(
  candidates: readonly DevRootCandidate[]
): DevRootCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    defaultOn: candidate.projectCount >= MIN_PROJECTS_FOR_DEFAULT_ON
  }));
}

export function selectDefaultOnRoots(
  candidates: readonly DevRootCandidate[]
): string[] {
  return candidates.filter((c) => c.defaultOn).map((c) => c.parentPath);
}
