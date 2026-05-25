import { readRegistry } from "../bundles/registry.js";
import type { CommandResult } from "./add.js";

export interface BundlesCommandInput {
  homeDir: string;
  flags: { json?: boolean; verbose?: boolean };
}

export async function runBundlesCommand(input: BundlesCommandInput): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const reg = await readRegistry(input.homeDir);

  if (input.flags.json) {
    stdout.push(JSON.stringify(reg, null, 2));
    return { exitCode: 0, stdout, stderr };
  }

  if (reg.bundles.length === 0) {
    stdout.push("No bundles installed. Use `ankui add <git-url>` to add one.");
    return { exitCode: 0, stdout, stderr };
  }

  const rows = reg.bundles.map((b) => {
    const distinctSkills = new Set(b.installs.map((i) => i.skillName)).size;
    const distinctTools = new Set(b.installs.map((i) => i.toolId)).size;
    const scopeLabel = b.scope === "project" ? `project (${b.projectCwd})` : "user";
    return `${pad(b.name, 18)}  ${distinctSkills} skills × ${distinctTools} tools  pinned ${b.pinnedSha.slice(0, 7)}  ${scopeLabel}`;
  });
  stdout.push(...rows);

  if (input.flags.verbose) {
    for (const b of reg.bundles) {
      stdout.push("");
      stdout.push(`${b.name}:`);
      for (const inst of b.installs) {
        stdout.push(`  ${inst.toolId} :: ${inst.symlinkPath}`);
      }
    }
  }

  return { exitCode: 0, stdout, stderr };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
