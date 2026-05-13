#!/usr/bin/env node
import { Command } from "commander";

import { runAccessCommand } from "./commands/access.js";
import { runCapsCommand } from "./commands/caps.js";
import { runDiscoverCommand } from "./commands/discover.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runListCommand } from "./commands/list.js";
import { runMcpCommand } from "./commands/mcp.js";
import { runScanAllCommand } from "./commands/scan-all.js";
import { runShowCommand } from "./commands/show.js";
import { loadAllScans, readDevRootsConfig } from "./scanner/multi-project.js";
import { scan } from "./scanner/index.js";
import { renderTui } from "./tui/render.js";
import { formatError } from "./utils/errors.js";
import { formatJson, formatScanSummary } from "./utils/format.js";
import os from "node:os";

interface GlobalOptions {
  json?: boolean;
}

const program = new Command();

program
  .name("ankui")
  .description("Remember what your AI agents can access.")
  .option("--json", "print the full sanitized scan result as JSON")
  .option("--no-color", "disable ANSI colors")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    if (globalOptions.json) {
      await runScanCommand();
      return;
    }
    await launchTui();
  });

program
  .command("scan")
  .description("Run a local scan and print a summary.")
  .action(async () => {
    await runScanCommand();
  });

program
  .command("tui")
  .description("Open the interactive terminal UI.")
  .action(async () => {
    await launchTui();
  });

program
  .command("access")
  .description("Print findings and review recommendations from the scan.")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    await runAccessCommand({
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("mcp")
  .description("Print a cross-tool MCP server overview.")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    await runMcpCommand({
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("doctor")
  .description("Print detection status and scanner warnings.")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    await runDoctorCommand({
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("scan-all")
  .description("Run scans across every project in every registered dev root.")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    await runScanAllCommand({
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("caps")
  .description("Print MCP capability categories overview.")
  .action(async () => {
    const globalOptions = program.opts<GlobalOptions>();
    await runCapsCommand({
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("list")
  .description("List skills, optionally filtered by --kind and --tool.")
  .option("--kind <kind>", "filter by skill kind (e.g., mcp_server, agent_skill)")
  .option("--tool <tool>", "filter by tool id (e.g., claude, codex)")
  .action(async (cmdOpts: { kind?: string; tool?: string }) => {
    const globalOptions = program.opts<GlobalOptions>();
    await runListCommand({
      json: Boolean(globalOptions.json),
      kind: cmdOpts.kind,
      tool: cmdOpts.tool,
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("show <tool>")
  .description("Print one tool's detected paths and skills.")
  .action(async (toolId: string) => {
    const globalOptions = program.opts<GlobalOptions>();
    await runShowCommand({
      toolId,
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

program
  .command("discover")
  .description("Crawl ~ for AI projects and propose dev roots for ~/.config/ankui/config.json.")
  .option("--apply", "write the default-ON dev roots into the config file", false)
  .action(async (cmdOpts: { apply?: boolean }) => {
    const globalOptions = program.opts<GlobalOptions>();
    await runDiscoverCommand({
      apply: Boolean(cmdOpts.apply),
      json: Boolean(globalOptions.json),
      write: (chunk) => process.stdout.write(chunk)
    });
  });

async function runScanCommand(options: { showTuiPlaceholder?: boolean } = {}): Promise<void> {
  const result = await scan();
  const globalOptions = program.opts<GlobalOptions>();

  if (globalOptions.json) {
    process.stdout.write(formatJson(result));
    return;
  }

  if (options.showTuiPlaceholder) {
    process.stdout.write("Ankui TUI is not implemented yet. Showing scan summary instead.\n\n");
  }

  process.stdout.write(`${formatScanSummary(result)}\n`);
}

async function launchTui(): Promise<void> {
  const homeDir = os.homedir();
  const config = await readDevRootsConfig(homeDir);
  const result = await loadAllScans({
    devRoots: config.devRoots,
    homeDir,
    env: process.env
  });
  await renderTui(result);
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`ankui: ${formatError(error)}\n`);
  process.exitCode = 1;
}
