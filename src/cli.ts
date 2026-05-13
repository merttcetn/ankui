#!/usr/bin/env node
import { Command } from "commander";

import { runAccessCommand } from "./commands/access.js";
import { runMcpCommand } from "./commands/mcp.js";
import { scan } from "./scanner/index.js";
import { formatError } from "./utils/errors.js";
import { formatJson, formatScanSummary } from "./utils/format.js";

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
    await runScanCommand({
      showTuiPlaceholder: true
    });
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
    await runScanCommand({
      showTuiPlaceholder: true
    });
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

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`ankui: ${formatError(error)}\n`);
  process.exitCode = 1;
}
