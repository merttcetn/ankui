import os from "node:os";
import path from "node:path";

export interface PathContext {
  cwd?: string;
  homeDir?: string;
}

export function resolveLocalPath(inputPath: string, context: PathContext = {}): string {
  const cwd = context.cwd ?? process.cwd();
  const homeDir = context.homeDir ?? os.homedir();

  if (inputPath === "~") {
    return path.resolve(homeDir);
  }

  if (inputPath.startsWith("~/")) {
    return path.resolve(homeDir, inputPath.slice(2));
  }

  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  return path.resolve(cwd, inputPath);
}

export function toDisplayPath(inputPath: string, context: PathContext = {}): string {
  const homeDir = path.resolve(context.homeDir ?? os.homedir());
  const normalizedPath = path.resolve(inputPath);

  if (normalizedPath === homeDir) {
    return "~";
  }

  if (isPathInside(normalizedPath, homeDir)) {
    return `~/${path.relative(homeDir, normalizedPath)}`;
  }

  return normalizedPath;
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function splitPathSegments(inputPath: string): string[] {
  return path
    .normalize(inputPath)
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);
}
