import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 7373;
const MAX_PORT_FALLBACK = 20;

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

export interface CreateWebServerOptions {
  handler: RequestHandler;
  /** Preferred port. `0` asks the OS for an ephemeral port. Default 7373. */
  port?: number;
  /** Bind address. Default 127.0.0.1 — never expose this to the network. */
  host?: string;
}

export interface WebServerHandle {
  server: http.Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/**
 * Starts an HTTP server bound to loopback. When `port` is a concrete number
 * already in use, the next port is tried, up to +20; this keeps a second
 * `ankui web` from failing hard. `port: 0` always succeeds (OS-assigned).
 */
export async function createWebServer(
  options: CreateWebServerOptions
): Promise<WebServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const preferred = options.port ?? DEFAULT_PORT;
  const server = http.createServer((req, res) => {
    void Promise.resolve(options.handler(req, res)).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
      }
      res.end("internal error");
    });
  });

  const port = await listen(server, host, preferred);
  const url = `http://${host}:${port}`;

  return {
    server,
    host,
    port,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}

function listen(
  server: http.Server,
  host: string,
  preferred: number
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let attempt = 0;

    const tryListen = (candidate: number): void => {
      const onError = (err: NodeJS.ErrnoException): void => {
        if (err.code === "EADDRINUSE" && candidate !== 0 && attempt < MAX_PORT_FALLBACK) {
          attempt += 1;
          tryListen(candidate + 1);
          return;
        }
        reject(err);
      };

      server.once("error", onError);
      server.listen(candidate, host, () => {
        server.removeListener("error", onError);
        const address = server.address();
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("server.address() did not return an AddressInfo"));
        }
      });
    };

    tryListen(preferred);
  });
}
