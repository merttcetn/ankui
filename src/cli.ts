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
import { runWatchCommand } from "./commands/watch.js";
import { buildLaunchTuiResult } from "./commands/launch-tui.js";
import {
  getAnkuiConfigPath,
  mergeDevRoots,
  writeAnkuiConfig
} from "./config/ankui-config.js";
import { scan } from "./scanner/index.js";
import { renderTui } from "./tui/render.js";
import {
  computeSessionSummary,
  formatSessionSummary,
  type SessionAction
} from "./utils/session-summary.js";
import { formatError } from "./utils/errors.js";
import { formatJson, formatScanSummary } from "./utils/format.js";
import fs from "node:fs/promises";
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
  .option(
    "--show-builtins",
    "include CLI-bundled defaults (init, review, debug, …) for Claude, Codex, Gemini"
  )
  .action(async (cmdOpts: { showBuiltins?: boolean }) => {
    await runScanCommand({ showBuiltins: Boolean(cmdOpts.showBuiltins) });
  });

program
  .command("tui")
  .description("Open the interactive terminal UI.")
  .action(async () => {
    await launchTui();
  });

program
  .command("watch")
  .description("Open the TUI and live-rescan when config files change.")
  .action(async () => {
    const handle = await runWatchCommand();
    await handle.exitPromise;
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

async function runScanCommand(
  options: { showTuiPlaceholder?: boolean; showBuiltins?: boolean } = {}
): Promise<void> {
  const result = await scan({ showBuiltins: options.showBuiltins });
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
  const configPath = getAnkuiConfigPath(homeDir);

  if (!(await fileExists(configPath))) {
    // First-run mode: render the FirstRunScan wizard. The user picks dev roots;
    // onConfigChange writes the config file, then App exits Ink so the next
    // `ankui` invocation launches against a freshly populated config.
    await renderTui({
      mode: "firstRun",
      homeDir,
      onConfigChange: async (devRoots) => {
        const merged = mergeDevRoots([], devRoots);
        await writeAnkuiConfig({ version: 1, devRoots: merged }, homeDir);
      }
    });
    return;
  }

  let capturedActions: ReadonlyArray<SessionAction> = [];
  await renderTui({
    loadScan: () =>
      buildLaunchTuiResult({
        homeDir,
        env: process.env
      }),
    onExit: (actions) => {
      capturedActions = actions;
    }
  });
  const text = formatSessionSummary(computeSessionSummary(capturedActions));
  if (text) {
    console.log(text);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`ankui: ${formatError(error)}\n`);
  process.exitCode = 1;
}
