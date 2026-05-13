import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDefaultOnHeuristic,
  groupProjectsByParent,
  MIN_PROJECTS_FOR_DEFAULT_ON,
  selectDefaultOnRoots
} from "../../src/scanner/project-discovery.js";
import type { FoundProject } from "../../src/scanner/filesystem-crawler.js";

function project(parentPath: string, name: string): FoundProject {
  return {
    projectPath: `${parentPath}/${name}`,
    parentPath,
    markers: [".claude"],
    depth: 2
  };
}

test("MIN_PROJECTS_FOR_DEFAULT_ON is 3", () => {
  assert.equal(MIN_PROJECTS_FOR_DEFAULT_ON, 3);
});

test("groupProjectsByParent buckets projects by parentPath", () => {
  const projects: FoundProject[] = [
    project("/Users/x/Developer/Ceto's Projects", "ankui"),
    project("/Users/x/Developer/Ceto's Projects", "visa-prep"),
    project("/Users/x/Developer/Ceto's Projects", "gstack"),
    project("/Users/x/code", "experiment")
  ];

  const candidates = groupProjectsByParent(projects);

  assert.equal(candidates.length, 2);
  const ceto = candidates.find((c) => c.parentPath.endsWith("Ceto's Projects"))!;
  assert.equal(ceto.projectCount, 3);
  assert.deepEqual(ceto.projectPaths.sort(), [
    "/Users/x/Developer/Ceto's Projects/ankui",
    "/Users/x/Developer/Ceto's Projects/gstack",
    "/Users/x/Developer/Ceto's Projects/visa-prep"
  ]);
  const code = candidates.find((c) => c.parentPath === "/Users/x/code")!;
  assert.equal(code.projectCount, 1);
});

test("groupProjectsByParent sorts by descending projectCount, then alphabetical parentPath", () => {
  const projects: FoundProject[] = [
    project("/Users/x/aaa", "p1"),
    project("/Users/x/aaa", "p2"),
    project("/Users/x/bbb", "p1"),
    project("/Users/x/bbb", "p2"),
    project("/Users/x/bbb", "p3"),
    project("/Users/x/ccc", "p1")
  ];

  const ordered = groupProjectsByParent(projects).map((c) => c.parentPath);

  // bbb has 3 → first. aaa and ccc both have lower counts; alpha tiebreak.
  assert.equal(ordered[0], "/Users/x/bbb");
  // Of the remaining, aaa (2) comes before ccc (1) by count.
  assert.equal(ordered[1], "/Users/x/aaa");
  assert.equal(ordered[2], "/Users/x/ccc");
});

test("applyDefaultOnHeuristic flips defaultOn at the 3-project boundary", () => {
  const before = [
    { parentPath: "/x", projectCount: 3, projectPaths: ["/x/a", "/x/b", "/x/c"], defaultOn: false },
    { parentPath: "/y", projectCount: 2, projectPaths: ["/y/a", "/y/b"], defaultOn: false },
    { parentPath: "/z", projectCount: 1, projectPaths: ["/z/a"], defaultOn: false }
  ];
  const after = applyDefaultOnHeuristic(before);
  assert.equal(after.find((c) => c.parentPath === "/x")!.defaultOn, true);
  assert.equal(after.find((c) => c.parentPath === "/y")!.defaultOn, false);
  assert.equal(after.find((c) => c.parentPath === "/z")!.defaultOn, false);
});

test("selectDefaultOnRoots returns absolute parent paths of default-on candidates only", () => {
  const candidates = [
    { parentPath: "/a", projectCount: 5, projectPaths: [], defaultOn: true },
    { parentPath: "/b", projectCount: 1, projectPaths: [], defaultOn: false },
    { parentPath: "/c", projectCount: 4, projectPaths: [], defaultOn: true }
  ];
  assert.deepEqual(selectDefaultOnRoots(candidates), ["/a", "/c"]);
});

test("groupProjectsByParent returns [] for empty input", () => {
  assert.deepEqual(groupProjectsByParent([]), []);
});
