import os from "node:os";

import { generateToken } from "../web/security.js";
import { createWebServer } from "../web/server.js";
import { handleRequest, type RouteContext } from "../web/routes.js";
import { openBrowser } from "../web/open-browser.js";

export interface RunWebCommandOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
  /** Preferred port. Default 7373 (server falls back if taken). */
  port?: number;
  /** Open the browser automatically. Default true. */
  open?: boolean;
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
    homeDir,
    env
  };

  const server = await createWebServer({
    port: options.port,
    handler: (req, res) => handleRequest(req, res, ctx)
  });
  ctx.expectedOrigin = server.url;

  write(
    `\n  Ankui web UI  ${server.url}\n` +
      `  local files only · read-only scan · Ctrl+C to stop\n\n`
  );

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
