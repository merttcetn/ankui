import type { MultiProjectScanResult, Skill } from "../types.js";
import type { SkillWriterResult, WriterContext } from "../writer/index.js";

export interface ActionRequest {
  skillId: string;
  action: "disable" | "enable";
}

export interface ActionOutcome {
  skillId: string;
  ok: boolean;
  message: string;
}

export interface ApplyActionsResult {
  outcomes: ActionOutcome[];
  /** A fresh scan reflecting post-write disk state. */
  scan: MultiProjectScanResult;
}

export interface ApplyActionsDeps {
  /** Loads a fresh multi-project scan. */
  loadScan: () => Promise<MultiProjectScanResult>;
  disableSkill: (skill: Skill, ctx: WriterContext) => Promise<SkillWriterResult>;
  enableSkill: (skill: Skill, ctx: WriterContext) => Promise<SkillWriterResult>;
  homeDir: string;
}

/**
 * Resolves each requested skill against a fresh scan and applies the
 * enable/disable rename via the writer module. Only user-scope skills are
 * resolvable here — this matches the TUI Actions tab, which never writes
 * project-scoped skills. Returns an outcome per request plus a re-scan so
 * the client renders post-write state without a second round-trip.
 */
export async function applyActions(
  changes: ReadonlyArray<ActionRequest>,
  deps: ApplyActionsDeps
): Promise<ApplyActionsResult> {
  const before = await deps.loadScan();
  const outcomes: ActionOutcome[] = [];

  for (const change of changes) {
    const skill = findUserScopeSkill(before, change.skillId);
    if (!skill) {
      outcomes.push({
        skillId: change.skillId,
        ok: false,
        message: "skill not found"
      });
      continue;
    }

    const diskDisabled = skill.details?.disabled === true;
    const wantDisabled = change.action === "disable";
    if (wantDisabled === diskDisabled) {
      outcomes.push({
        skillId: change.skillId,
        ok: true,
        message: "already in desired state"
      });
      continue;
    }

    const op = change.action === "disable" ? deps.disableSkill : deps.enableSkill;
    const ctx: WriterContext = { homeDir: deps.homeDir, cwd: before.cwd };
    try {
      const result = await op(skill, ctx);
      outcomes.push(
        result.ok
          ? { skillId: change.skillId, ok: true, message: `${change.action}d` }
          : { skillId: change.skillId, ok: false, message: result.message }
      );
    } catch (error) {
      outcomes.push({
        skillId: change.skillId,
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // A second full scan so the client renders post-write disk state without
  // another round-trip. This is a deliberate cost trade for a local
  // single-user tool; revisit if multi-project scans become a bottleneck.
  const scan = await deps.loadScan();
  return { outcomes, scan };
}

function findUserScopeSkill(
  result: MultiProjectScanResult,
  skillId: string
): Skill | undefined {
  for (const tool of result.userScope.tools) {
    for (const skill of tool.skills) {
      if (skill.id === skillId) return skill;
    }
  }
  return undefined;
}
