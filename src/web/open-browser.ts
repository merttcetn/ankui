import { spawn } from "node:child_process";

export interface BrowserCommand {
  command: string;
  args: string[];
}

/** Picks the platform-appropriate URL-opening command. */
export function browserOpenCommand(
  platform: NodeJS.Platform,
  url: string
): BrowserCommand {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    // The empty "" is `start`'s window-title argument; without it a URL with
    // spaces or `&` would be misparsed as the title.
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

/**
 * Best-effort browser open. Never throws and never blocks — a failed launch
 * is non-fatal; the user can always open the printed URL by hand.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform
): void {
  const { command, args } = browserOpenCommand(platform, url);
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* ignore — non-fatal */
    });
    child.unref();
  } catch {
    /* ignore — non-fatal */
  }
}
