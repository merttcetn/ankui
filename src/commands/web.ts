import os from "node:os";

import { generateToken } from "../web/security.js";
import { createWebServer } from "../web/server.js";
import {
  buildAllowedLoopbackOrigins,
  handleRequest,
  type RouteContext
} from "../web/routes.js";
import { openBrowser } from "../web/open-browser.js";

export interface RunWebCommandOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
  /** Preferred port. Default 7373 (server falls back if taken). */
  port?: number;
  /** Open the browser automatically. Default true. */
  open?: boolean;
  /** Force-disable ANSI colors. When undefined, falls back to NO_COLOR env + TTY detection. */
  noColor?: boolean;
  write?: (chunk: string) => void;
}

export interface WebCommandHandle {
  url: string;
  /** Stops the server and resolves `done`. */
  close: () => Promise<void>;
  /** Resolves once the server has stopped (e.g. after SIGINT). */
  done: Promise<void>;
}

/**
 * Starts the Ankui web UI: generates a session token, wires the router,
 * binds a loopback server, opens the browser, and stays up until SIGINT.
 */
export async function runWebCommand(
  options: RunWebCommandOptions = {}
): Promise<WebCommandHandle> {
  const homeDir = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;
  const write = options.write ?? ((chunk: string) => process.stdout.write(chunk));

  const ctx: RouteContext = {
    token: generateToken(),
    expectedOrigin: "",
    allowedOrigins: new Set<string>(),
    homeDir,
    env
  };

  const server = await createWebServer({
    port: options.port,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = server.url;
  ctx.allowedOrigins = buildAllowedLoopbackOrigins(server.url);

  // NO_COLOR spec: presence of the env var (incl. empty string) disables color.
  const envDisablesColor = env.NO_COLOR !== undefined;
  const useColor =
    !options.noColor && !envDisablesColor && Boolean(process.stdout.isTTY);
  write(renderBanner(server.url, useColor));

  if (options.open !== false) {
    openBrowser(server.url);
  }

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stop = async (): Promise<void> => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await server.close();
    resolveDone();
  };
  const onSignal = (): void => {
    void stop();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return { url: server.url, close: stop, done };
}

function renderBanner(url: string, color: boolean): string {
  const wrap = (open: string) =>
    color ? (s: string) => `${open}${s}\x1b[0m` : (s: string) => s;
  const cyan = wrap("\x1b[36m");
  const bold = wrap("\x1b[1m");
  const dim = wrap("\x1b[2m");
  const stopKey = process.platform === "darwin" ? "⌃C" : "ctrl+c";

  return (
    `\n` +
    `  ${cyan("●")} ${bold("ankui")} ${dim("/ web ui")}\n` +
    `  ${dim("remember what your agents can access")}\n` +
    `\n` +
    `     ${cyan("→")}  ${bold(url)}\n` +
    `     ${dim(`local files · read-only scan · ${stopKey} to stop`)}\n` +
    `\n`
  );
}
