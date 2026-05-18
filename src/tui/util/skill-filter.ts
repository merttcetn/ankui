import type { Skill } from "../../types.js";

export function filterSkillsByQuery(
  skills: ReadonlyArray<Skill>,
  query: string | undefined
): ReadonlyArray<Skill> {
  if (!query || query.length === 0) return skills;
  const needle = query.toLowerCase();
  return skills.filter((skill) => skill.name.toLowerCase().includes(needle));
}
