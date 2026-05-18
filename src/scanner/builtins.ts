import type { Skill, SkillKind, ToolId } from "../types.js";
import { buildSkill } from "./adapters/shared.js";

interface BuiltinEntry {
  name: string;
  kind: SkillKind;
  summary: string;
}

const CLAUDE_BUILTINS: readonly BuiltinEntry[] = [
  { name: "batch", kind: "agent_skill", summary: "Orchestrate large-scale changes across a codebase via background subagents in worktrees." },
  { name: "claude-api", kind: "agent_skill", summary: "Load Claude API and Managed Agents reference material for the project's language." },
  { name: "debug", kind: "agent_skill", summary: "Enable session debug logging and troubleshoot issues by reading the debug log." },
  { name: "fewer-permission-prompts", kind: "agent_skill", summary: "Scan transcripts and add a project allowlist to reduce permission prompts." },
  { name: "loop", kind: "agent_skill", summary: "Run a prompt repeatedly on an interval or self-paced while the session stays open." },
  { name: "simplify", kind: "agent_skill", summary: "Review recently changed files for reuse, quality, and efficiency, then apply fixes." },
  { name: "init", kind: "custom_commands", summary: "Initialize the project with a CLAUDE.md guide." },
  { name: "review", kind: "custom_commands", summary: "Review a pull request locally in the current session." },
  { name: "security-review", kind: "custom_commands", summary: "Analyze pending changes on the current branch for security vulnerabilities." }
];

const CODEX_BUILTINS: readonly BuiltinEntry[] = [
  { name: "init", kind: "custom_commands", summary: "Generate an AGENTS.md scaffold for the project." },
  { name: "skills", kind: "custom_commands", summary: "Browse and apply task-specific skills." },
  { name: "plan", kind: "custom_commands", summary: "Enter plan mode for task proposals." },
  { name: "review", kind: "custom_commands", summary: "Request working-tree analysis." },
  { name: "agent", kind: "custom_commands", summary: "Switch between active agent threads." },
  { name: "plugins", kind: "custom_commands", summary: "Manage installed and discoverable plugins." },
  { name: "hooks", kind: "custom_commands", summary: "Review and manage lifecycle hooks." }
];

const GEMINI_BUILTINS: readonly BuiltinEntry[] = [
  { name: "init", kind: "custom_commands", summary: "Generate a tailored GEMINI.md context file for the project." },
  { name: "skills", kind: "custom_commands", summary: "Manage Agent Skills providing specialized expertise." },
  { name: "plan", kind: "custom_commands", summary: "Switch to Plan Mode (read-only) and view the current plan." },
  { name: "agents", kind: "custom_commands", summary: "Manage local and remote subagents." },
  { name: "extensions", kind: "custom_commands", summary: "Manage extensions for Gemini CLI." },
  { name: "commands", kind: "custom_commands", summary: "Manage custom slash commands loaded from .toml files." },
  { name: "hooks", kind: "custom_commands", summary: "Manage hooks that customize CLI behavior at lifecycle events." },
  { name: "setup-github", kind: "custom_commands", summary: "Set up GitHub Actions for issue triage and PR review." },
  { name: "tools", kind: "custom_commands", summary: "Display available tools with optional descriptions." }
];

const REGISTRY: Partial<Record<ToolId, readonly BuiltinEntry[]>> = {
  claude: CLAUDE_BUILTINS,
  codex: CODEX_BUILTINS,
  gemini: GEMINI_BUILTINS
};

export function expandBuiltinsForTool(toolId: ToolId): Skill[] {
  const entries = REGISTRY[toolId] ?? [];
  const sourcePath = `<builtin:${toolId}>`;

  return entries.map((entry) =>
    buildSkill({
      toolId,
      kind: entry.kind,
      name: entry.name,
      summary: entry.summary,
      scope: "user",
      sourcePath,
      source: "builtin",
      details: { builtin: true }
    })
  );
}
