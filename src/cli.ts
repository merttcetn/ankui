#!/usr/bin/env node
import { Command } from "commander";

import { runAccessCommand } from "./commands/access.js";
import { runAddCommand } from "./commands/add.js";
import { runBundlesCommand } from "./commands/bundles.js";
import { runCapsCommand } from "./commands/caps.js";
import { runDiscoverCommand } from "./commands/discover.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runListCommand } from "./commands/list.js";
import { runMcpCommand } from "./commands/mcp.js";
import { runRemoveCommand } from "./commands/remove.js";
import { runScanAllCommand } from "./commands/scan-all.js";
import { runShowCommand } from "./commands/show.js";
import { runUpdateCommand } from "./commands/update.js";
import { runWatchCommand } from "./commands/watch.js";
import { runWebCommand } from "./commands/web.js";
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
  .command("web")
  .description("Open the web UI in a browser.")
  .option("--port <port>", "preferred port (default: 7373)", (v) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`invalid --port "${v}": expected an integer 1-65535`);
    }
    return n;
  })
  .option("--no-open", "do not open the browser automatically")
  .action(async (cmdOpts: { port?: number; open?: boolean }) => {
    const handle = await runWebCommand({
      port: cmdOpts.port,
      open: cmdOpts.open
    });
    await handle.done;
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
  .command("add <url>")
  .description("Clone a GitHub skill bundle and install its SKILL.md files.")
  .option("--claude", "install for Claude only")
  .option("--skills-sh", "install for skills-sh only")
  .option("--all", "install for every applicable installed tool (default)")
  .option("--project", "install into the current project's .claude/skills/ instead of ~")
  .option("--force", "overwrite conflicting files")
  .option("--skip-conflicts", "install non-conflicting items, skip the rest")
  .option("--yes", "skip the confirmation prompt")
  .option("--max-size <mb>", "cap the cloned bundle size in MB (default 50)", (v) => parseInt(v, 10))
  .action(async (url: string, opts: { claude?: boolean; skillsSh?: boolean; all?: boolean; project?: boolean; force?: boolean; skipConflicts?: boolean; yes?: boolean; maxSize?: number }) => {
    const flags = {
      claude: opts.claude,
      skillsSh: opts.skillsSh,
      all: opts.all,
      project: opts.project,
      force: opts.force,
      skipConflicts: opts.skipConflicts,
      yes: opts.yes,
      maxSizeMb: opts.maxSize
    };
    if (!flags.yes) {
      process.stderr.write("ankui add: pass --yes to confirm install (v1 has no interactive prompt yet)\n");
      process.exit(1);
    }
    const result = await runAddCommand({ urlOrPath: url, flags, homeDir: os.homedir(), cwd: process.cwd() });
    for (const l of result.stdout) console.log(l);
    for (const l of result.stderr) console.error(l);
    process.exit(result.exitCode);
  });

program
  .command("remove <name>")
  .description("Uninstall a tracked bundle by name (e.g., 'owner/repo').")
  .option("--yes", "skip the confirmation prompt")
  .option("--keep-clone", "leave the cloned bundle on disk; only remove symlinks + registry entry")
  .action(async (name: string, cmdOpts: { yes?: boolean; keepClone?: boolean }) => {
    if (!cmdOpts.yes) {
      process.stderr.write("ankui remove: pass --yes to confirm removal (v1 has no interactive prompt yet)\n");
      process.exit(1);
    }
    const result = await runRemoveCommand({
      name,
      flags: { yes: true, keepClone: cmdOpts.keepClone },
      homeDir: os.homedir(),
      cwd: process.cwd()
    });
    for (const l of result.stdout) console.log(l);
    for (const l of result.stderr) console.error(l);
    process.exit(result.exitCode);
  });

program
  .command("update [name]")
  .description("Fetch upstream changes for a tracked bundle (or all of them with --all) and apply added/removed/modified skills.")
  .option("--all", "update every tracked bundle")
  .option("--yes", "skip the confirmation prompt")
  .option("--force", "overwrite conflicting files on added skills")
  .option("--skip-conflicts", "install non-conflicting added items, skip the rest")
  .action(async (name: string | undefined, cmdOpts: { all?: boolean; yes?: boolean; force?: boolean; skipConflicts?: boolean }) => {
    if (!cmdOpts.yes) {
      process.stderr.write("ankui update: pass --yes to confirm update (v1 has no interactive prompt yet)\n");
      process.exit(1);
    }
    const homeDir = os.homedir();
    const cwd = process.cwd();
    let names: string[] = [];
    if (cmdOpts.all) {
      const { readRegistry } = await import("./bundles/registry.js");
      const reg = await readRegistry(homeDir);
      names = reg.bundles.map((b) => b.name);
      if (names.length === 0) {
        console.log("No bundles installed.");
        process.exit(0);
      }
    } else {
      if (!name) {
        process.stderr.write("ankui update: provide a bundle name (e.g., owner/repo) or pass --all\n");
        process.exit(1);
      }
      names = [name];
    }
    let exit = 0;
    for (const n of names) {
      const result = await runUpdateCommand({
        name: n,
        flags: { yes: true, force: cmdOpts.force, skipConflicts: cmdOpts.skipConflicts },
        homeDir,
        cwd
      });
      for (const l of result.stdout) console.log(l);
      for (const l of result.stderr) console.error(l);
      if (result.exitCode !== 0) exit = result.exitCode;
    }
    process.exit(exit);
  });

program
  .command("bundles")
  .description("List installed Ankui-tracked bundles.")
  .option("--verbose", "show each (tool, skill) install path")
  .action(async (cmdOpts: { verbose?: boolean }) => {
    const globalOptions = program.opts<GlobalOptions>();
    const result = await runBundlesCommand({
      homeDir: os.homedir(),
      flags: { json: Boolean(globalOptions.json), verbose: cmdOpts.verbose }
    });
    for (const l of result.stdout) console.log(l);
    for (const l of result.stderr) console.error(l);
    process.exit(result.exitCode);
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
