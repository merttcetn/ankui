export function relativizeHome(filePath: string, homeDir: string): string {
  if (homeDir && filePath.startsWith(homeDir + "/")) {
    return `~${filePath.slice(homeDir.length)}`;
  }
  if (homeDir && filePath === homeDir) {
    return "~";
  }
  return filePath;
}
