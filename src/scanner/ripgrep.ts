import { spawn } from "node:child_process";

import { rgPath } from "@vscode/ripgrep";

import { createWarning, type Warning } from "../types.js";

export interface RipgrepFilesOptions {
  cwd: string;
  globs?: string[];
  excludeGlobs?: string[];
}

export interface RipgrepFilesResult {
  paths: string[];
  warnings: Warning[];
}

export async function listRipgrepFiles(
  options: RipgrepFilesOptions
): Promise<RipgrepFilesResult> {
  const args = ["--files", "--hidden", "--null"];

  for (const glob of options.globs ?? []) {
    args.push("--glob", glob);
  }

  for (const glob of options.excludeGlobs ?? []) {
    args.push("--glob", `!${glob}`);
  }

  return new Promise((resolve) => {
    const child = spawn(rgPath, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      resolve({
        paths: [],
        warnings: [
          createWarning({
            reason: "unknown",
            path: options.cwd,
            message: `Could not run ripgrep discovery in ${options.cwd}: ${error.message}`
          })
        ]
      });
    });

    child.on("close", (code) => {
      if (code !== 0 && code !== 1) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        resolve({
          paths: [],
          warnings: [
            createWarning({
              reason: "unknown",
              path: options.cwd,
              message: `Ripgrep discovery failed in ${options.cwd}: ${stderr || `exit code ${code}`}`
            })
          ]
        });
        return;
      }

      const output = Buffer.concat(stdoutChunks).toString("utf8");
      const paths = output.split("\0").filter((entry) => entry.length > 0);

      resolve({
        paths,
        warnings: []
      });
    });
  });
}
