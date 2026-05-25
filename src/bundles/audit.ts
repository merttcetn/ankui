import fs from "node:fs/promises";
import path from "node:path";

import type { ToolId } from "../types.js";

export interface AuditEvent {
  ts: string;
  op: "add" | "update" | "remove" | "conflict_refused" | "error";
  url?: string;
  name?: string;
  sha?: string;
  toolId?: ToolId;
  skillName?: string;
  outcome: "ok" | "refused" | "error";
  message?: string;
}

export function getAuditPath(homeDir: string): string {
  return path.join(homeDir, ".ankui", "bundles", ".history.jsonl");
}

export async function appendAudit(homeDir: string, event: AuditEvent): Promise<void> {
  const p = getAuditPath(homeDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  // appendFile is atomic for small writes (< PIPE_BUF / O_APPEND semantics on POSIX)
  await fs.appendFile(p, `${JSON.stringify(event)}\n`, "utf8");
}
