import type { Skill, SkillKind } from "../../types.js";

export const SKILL_KIND_ORDER: ReadonlyArray<SkillKind> = [
  "mcp_server",
  "agent_skill",
  "skills_sh_skill",
  "custom_agents",
  "custom_commands",
  "custom_prompts",
  "custom_tools",
  "rules",
  "plugins",
  "memory_file"
];

export function groupSkillsByKind(skills: ReadonlyArray<Skill>): Map<SkillKind, Skill[]> {
  const byKind = new Map<SkillKind, Skill[]>();
  for (const skill of skills) {
    const list = byKind.get(skill.kind) ?? [];
    list.push(skill);
    byKind.set(skill.kind, list);
  }

  for (const list of byKind.values()) {
    list.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  const ordered = new Map<SkillKind, Skill[]>();
  for (const kind of SKILL_KIND_ORDER) {
    const list = byKind.get(kind);
    if (list && list.length > 0) ordered.set(kind, list);
  }
  return ordered;
}
