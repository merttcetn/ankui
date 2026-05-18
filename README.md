# Ankui

> Local-only inventory of what your AI coding tools can access.

## What Ankui is

AI coding tools accumulate configuration, skills, rules, and MCP servers across your filesystem, and it is easy to lose track of what each one can access. Ankui is a read-only local scanner and terminal UI that inventories those resources and surfaces access findings — it never executes user code, follows remote URLs, or sends data anywhere. Supported tools: Claude, Codex, Cursor, Gemini, OpenCode, and skills.sh.

## Try it

```bash
npx -y ankui@latest
```

For a persistent install:

```bash
npm install -g ankui
ankui
```

Requires Node >= 20.

## Quick start

Running `ankui` with no arguments opens the interactive terminal UI. Running `ankui scan` prints a summary to stdout:

```
Ankui scan complete

Detected tools: 5
MCP servers: 6 configured, 4 unique
Agent skills: 154
Commands/prompts/agents/rules/tools: 12
Memory files: 0
Access findings: 12
Warnings: 0

Tools:
✓ Claude    1 MCP · 49 agent skills · 1 rules · 6 plugins · 3 findings
✓ Codex     3 MCP · 58 agent skills · 1 rules · 5 findings
✓ Cursor    1 MCP · 1 findings
✓ Gemini    1 MCP · 47 agent skills · 4 plugins · 3 findings
✓ OpenCode  detected
- skills.sh not detected
```

Add `--json` to get the full sanitized scan result as JSON:

```bash
ankui --json | jq '.tools.claude.skills | length'
```

## Privacy and safety

Ankui sends no data anywhere and calls no external APIs.

**Sensitive files skipped.** Any file matching these patterns is skipped with a `sensitive_file_skipped` warning rather than read:

- `.env` and any file starting with `.env`
- Files containing `token`, `secret`, or `credential` in the name
- Files starting with `auth`, `cookies`, or `session`
- Files ending with `.pem` or `.key`
- Files containing `apikey` or `api_key`
- Files starting with `private_key`

**Sensitive directories skipped.** Any path containing these directory segments is never entered:

- Common across all tools: `sessions`, `session`, `history`, `histories`, `conversation`, `conversations`
- Additional for OpenCode paths: `auth`, `log`, `logs`, `share`, `cache`, `database`, `databases`, `db`, `runtime`

**File size cap.** Files larger than 1 MB (`MAX_SAFE_FILE_BYTES = 1024 * 1024`) are skipped with a `file_too_large` warning.

**Symlinks.** Symlinks whose resolved targets fall inside `$HOME` or `$CWD` are followed and reported with `details.linked: true` and `details.linkTarget`. Symlinks pointing outside those roots, or whose resolved target hits a sensitive path segment, produce a `symlink_skipped` warning and are not read.

**Secret masking.** MCP server env blocks have all values replaced with `......`. Any value under a key matching `token`, `secret`, `credential`, `password`, `apikey`, `private_key`, `access_token`, `refresh_token`, `auth_token`, or `client_secret` is masked before the result is returned. Credential URLs (Basic auth username/password) are masked in MCP command args.

**Session, history, auth, log, and database files are never read.** The directory exclusions above cover OpenCode's runtime database, session store, share store, auth store, and log directories. No conversation data or model response history is ever accessed.

## Supported tools

| Tool | User-scope paths | Project-scope paths |
|------|-----------------|---------------------|
| **Claude** | `~/.claude/` (settings, skills, commands, agents), `~/.claude.json` | `.claude/` (settings, skills, commands, agents), `CLAUDE.md`, `CLAUDE.local.md`, `.mcp.json` |
| **Codex** | `~/.codex/config.toml` (MCP servers), `~/.codex/prompts/` (custom prompts), `~/.codex/skills/` (agent skills), `~/.codex/rules/` (permission rules) | `.codex/config.toml`, `.codex/prompts/`, `.codex/skills/`, `AGENTS.md` |
| **Cursor** | `~/.cursor/mcp.json` (MCP servers), `~/.cursor/rules/` (`.mdc` rules files) | `.cursor/mcp.json`, `.cursor/rules/`, `.mcp.json`, `.cursorrules` |
| **Gemini** | `~/.gemini/settings.json` (MCP servers), `~/.gemini/commands/` (custom commands), `~/.gemini/skills/` (agent skills), `~/.gemini/extensions/` (extensions) | `.gemini/commands/`, `.gemini/skills/`, `GEMINI.md` |
| **OpenCode** | `~/.config/opencode/` (agents, commands, tools, skills) | `opencode.json`, `opencode.jsonc` (MCP servers, plugins, tool permissions), `.opencode/` (agents, commands, tools, skills), `AGENTS.md` |
| **skills.sh** | `~/.skills/`, `~/.config/skills/` | `.skills/` |

Each tool adapter reads only from the paths listed above. All access goes through the safety layer described in the previous section.

## CLI commands

Global flags that apply to all commands:

- `--json` — print the full sanitized result as JSON instead of human-readable output.
- `--no-color` — disable ANSI colour codes (useful in CI or when piping output).

---

### `ankui scan`

Run a local scan and print a summary.

```
Usage: ankui scan [options]

Run a local scan and print a summary.
```

No tool-specific flags. The command reads user-scope and project-scope paths for all six tools and prints the counts shown in the Quick start section above.

---

### `ankui tui`

Open the interactive terminal UI.

```
Usage: ankui tui [options]

Open the interactive terminal UI.
```

`ankui` with no arguments is equivalent to `ankui tui`. On first launch (before `~/.config/ankui/config.json` exists), the first-run wizard runs to let you pick dev roots. After that, the full multi-project TUI opens. See the TUI keybindings section below.

---

### `ankui watch`

Open the TUI and live-rescan when config files change.

```
Usage: ankui watch [options]

Open the TUI and live-rescan when config files change.
```

Uses chokidar to watch known tool directories and AI-project files under registered dev roots. File changes are debounced (300 ms stabilisation threshold). Sensitive directories are excluded from the watch list. Press `q` or `Ctrl-C` to quit.

---

### `ankui access`

Print findings and review recommendations from the scan.

```
Usage: ankui access [options]

Print findings and review recommendations from the scan.
```

Findings are grouped by category in priority order: `duplicate_mcp` (the same MCP server configured across multiple tools), `secret_reference` (MCP servers with secret-bearing env keys), `dangerous_pattern` (skills containing `curl | sh`, `rm -rf`, or similar patterns), `unknown_capability` (MCP servers not in the built-in catalog).

Example output structure:

```
Ankui access review — 10 findings (6 dangerous_pattern · 2 duplicate_mcp · 1 secret_reference · 1 unknown_capability)

Duplicate MCP servers (2)
─────────────────────────
• Reddit MCP is configured in 2 tools
  Scope: cross_tool · Tools: codex, gemini
  ...
```

---

### `ankui mcp`

Print a cross-tool MCP server overview.

```
Usage: ankui mcp [options]

Print a cross-tool MCP server overview.
```

Groups all configured MCP servers by canonical name. Shows capability category, access level, which tools have the server configured, and whether any configuration carries secret-bearing env keys. Cross-tool duplicates are flagged with a warning line.

---

### `ankui caps`

Print MCP capability categories overview.

```
Usage: ankui caps [options]

Print MCP capability categories overview.
```

Lists classified MCP servers grouped by capability category (`network`, `communication`, `filesystem`, etc.) in descending order of count, then prints a footer with the count of markdown-backed skills that are not categorised in this view. Unknown MCP servers (not in the built-in catalog) are not included in the category groups.

---

### `ankui doctor`

Print detection status and scanner warnings.

```
Usage: ankui doctor [options]

Print detection status and scanner warnings.
```

Shows which tools were detected and which paths each tool found at user scope and project scope. After the tool list, warnings are grouped by reason (`sensitive_file_skipped`, `symlink_skipped`, `file_too_large`, `permission_denied`, `parse_error`, `timeout`). A clean machine ends with `No warnings.`

---

### `ankui scan-all`

Run scans across every project in every registered dev root.

```
Usage: ankui scan-all [options]

Run scans across every project in every registered dev root.
```

Reads dev roots from `~/.config/ankui/config.json` (written by `ankui discover --apply` or the first-run TUI wizard). Scans up to 10 projects in parallel with a 5-second per-project timeout. Output shows user-scope skill counts followed by a per-project table.

Example:

```
Ankui multi-project scan — 16 projects across 3 dev roots, 178 user-scope skills

User scope
──────────
✓ Claude    63 skills
✓ Codex     62 skills
...

Projects (16)
─────────────
~/Developer/Ceto's Projects/ankui    1 skills · 0 findings
...
```

---

### `ankui list`

List skills, optionally filtered by `--kind` and `--tool`.

```
Usage: ankui list [options]

List skills, optionally filtered by --kind and --tool.

Options:
  --kind <kind>  filter by skill kind (e.g., mcp_server, agent_skill)
  --tool <tool>  filter by tool id (e.g., claude, codex)
```

Valid skill kinds include `mcp_server`, `agent_skill`, `custom_agents`, `custom_commands`, `custom_prompts`, `custom_tools`, `memory_file`, `rules`, `plugins`, `skills_sh_skill`. Valid tool ids are `claude`, `codex`, `cursor`, `gemini`, `opencode`, `skills-sh`. An invalid filter value exits with code 1 and a usage message.

---

### `ankui show <tool>`

Print one tool's detected paths and skills.

```
Usage: ankui show [options] <tool>

Print one tool's detected paths and skills.
```

Prints detected paths grouped by scope (user vs project), then all skills grouped by kind in canonical order. An unknown tool id exits with code 1 and lists the valid ids.

Example:

```
Ankui — claude

Detected at:
  user:
    ~/.claude
    ~/.claude.json
  project:
    ./.claude
    ./.claude/settings.local.json

mcp_server (1)
──────────────
  expo-mcp    ~/.claude.json

agent_skill (49)
────────────────
  autoplan    ~/.claude/skills/autoplan/SKILL.md
  ...
```

---

### `ankui discover`

Crawl `~` for AI projects and propose dev roots for `~/.config/ankui/config.json`.

```
Usage: ankui discover [options]

Crawl ~ for AI projects and propose dev roots for ~/.config/ankui/config.json.

Options:
  --apply  write the default-ON dev roots into the config file (default: false)
```

Crawls your home directory (max depth 6, concurrency 16) for directories that contain AI-tool marker files or directories. Groups found projects by parent directory into dev-root candidates. Parents with 3 or more AI projects are marked default-ON. Prints a dry-run summary by default; pass `--apply` to merge the selected roots into `~/.config/ankui/config.json`. A second `--apply` with the same roots is a no-op.

---

## TUI keybindings

| Key | Action |
|-----|--------|
| `←` / `→` | Cycle between tabs |
| `↑` / `↓` | Scroll the skill list in a drill-in screen |
| `Enter` | Drill into the selected item |
| `Esc` / `Backspace` | Drill out (return to the previous screen) |
| `/` | Open incremental search (drill-in screens only) |
| `r` | Rescan (refresh data from disk) |
| `q` | Quit |

Note: `Tab` is reserved for future focus navigation and does not cycle tabs in this version.

## Local development

```bash
npm install
npm run typecheck      # TypeScript strict-mode check (no emit)
npm test               # runs 407 tests via node:test + tsx
npm run build          # emits to dist/
node dist/cli.js scan  # smoke test against your real local config
```

Tests use the built-in `node:test` runner via `tsx`. Do not add Jest or Vitest unless explicitly required.

After a build, use `node dist/cli.js <command>` for local testing. All commands support `--json` for machine-readable output.

## Contributing an adapter

Adapters live in `src/scanner/adapters/`. Each adapter exports a `ScannerAdapter` object with a `toolId` and an async `scan(context)` method.

Invariants for any new adapter:

- Use `safeReadOptions(filePath, context)` from `shared.ts` for every file read. This enforces the symlink allowlist and file size cap consistently across all adapters.
- Never throw. Wrap all I/O in try/catch or rely on the safe helpers; produce `Warning` objects for every failure and attach them to the adapter result. The adapter runner isolates each adapter with a 1-second timeout, but adapters should still handle their own errors gracefully.
- Respect the 1 MB file size cap (`MAX_SAFE_FILE_BYTES` from `safety.ts`) and the 1-second per-adapter time budget.
- For markdown-backed skill paths (skills with `SKILL.md` or similar), call `await buildLinkDetails(filePath, context)` from `shared.ts` and spread the result into the `details` object. This ensures symlink metadata (`linked`, `linkTarget`) is recorded on every markdown skill.
- Add the adapter to `src/scanner/adapters/index.ts` so the scanner runner picks it up.

The scanner invariant is: every file or directory access goes through `src/scanner/safety.ts`. No adapter should call `fs.readFile` or `fs.readdir` directly.

## v1.1 roadmap

These items are deferred from the v1 MVP and are not scheduled:

**Similar-skill search.** Fuzzy match and token-overlap grouping across skill names, summaries, categories, and source paths. Would surface cases where the same conceptual skill (e.g. a GitHub MCP server, or a "careful" rule) is configured under multiple tools with slightly different names. No network calls; local only using the `fuse.js` dependency already present.

**Manual custom tools storage.** An Ankui-managed store (`~/.ankui/manual-tools.json`) for tracking tools that are not disk-detected. OpenCode custom tools are already in v1 because they come from real files; this deferred phase covers Ankui-managed entries only. Manual tools would be clearly marked as custom and kept separate from adapter-detected results.

---

MIT
