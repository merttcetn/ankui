import { scan, type ScanOptions } from "../scanner/index.js";
import { formatList, formatListJson, type ListFilters } from "../utils/format-list.js";
import { TOOL_DEFINITIONS, type SkillKind, type ToolId } from "../types.js";

export interface ListCommandOptions extends ScanOptions {
  json: boolean;
  kind?: string;
  tool?: string;
  write: (chunk: string) => void;
}

export class InvalidFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFilterError";
  }
}

const VALID_KINDS: ReadonlyArray<SkillKind> = [
  "mcp_server",
  "custom_commands",
  "custom_agents",
  "custom_prompts",
  "custom_tools",
  "plugins",
  "rules",
  "memory_file",
  "agent_skill",
  "skills_sh_skill"
];

const VALID_TOOL_IDS: ReadonlyArray<ToolId> = TOOL_DEFINITIONS.map((t) => t.id);

export async function runListCommand(options: ListCommandOptions): Promise<void> {
  const filters = validateFilters({ kind: options.kind, tool: options.tool });
  const { json, write, kind: _k, tool: _t, ...scanOptions } = options;
  void _k; void _t;
  const result = await scan(scanOptions);

  if (json) {
    write(formatListJson(result, filters));
    return;
  }
  write(`${formatList(result, filters)}\n`);
}

function validateFilters(input: { kind?: string; tool?: string }): ListFilters {
  const filters: ListFilters = {};
  if (input.kind !== undefined) {
    if (!VALID_KINDS.includes(input.kind as SkillKind)) {
      throw new InvalidFilterError(
        `Unknown --kind value: ${input.kind}. Valid kinds: ${VALID_KINDS.join(", ")}.`
      );
    }
    filters.kind = input.kind as SkillKind;
  }
  if (input.tool !== undefined) {
    if (!VALID_TOOL_IDS.includes(input.tool as ToolId)) {
      throw new InvalidFilterError(
        `Unknown --tool value: ${input.tool}. Valid tools: ${VALID_TOOL_IDS.join(", ")}.`
      );
    }
    filters.tool = input.tool as ToolId;
  }
  return filters;
}
