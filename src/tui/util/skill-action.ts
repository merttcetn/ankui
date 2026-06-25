/**
 * Skill enable/disable action helpers.
 *
 * Pure functions shared by the Actions-tab and Bundles-tab staging flows.
 * They resolve the Actions-tab cursor to its underlying skill, apply a
 * writer result to the scan model, and format failure messages. No disk
 * I/O and no React — consumers thread the result back through dispatch.
 */

import type React from "react";
import {
  createSkillId,
  type MultiProjectScanResult,
  type Skill,
  type ToolId
} from "../../types.js";
import type { SkillWriterResult } from "../../writer/index.js";
import type { TuiAction } from "../state/tui-state.js";
import {
  buildActionsModel,
  collectActionSkills,
  makeDesiredDisabled,
  type ActionsItem
} from "./actions-items.js";

export interface SkillActionSelection {
  id: string;
  toolId: Skill["toolId"];
  kind: Skill["kind"];
  name: string;
}

export function setCurrentResult(
  dispatch: React.Dispatch<TuiAction>,
  resultRef: React.MutableRefObject<MultiProjectScanResult>,
  result: MultiProjectScanResult
): void {
  resultRef.current = result;
  dispatch({ type: "setResult", result });
}

/**
 * Resolves the Actions-tab cursor to its model item. Returns a `header` item
 * (cursor on a group header), a `skill` item, or undefined (cursor stale after
 * a collapse). Walks the same model `ActionsTab` renders so indices align.
 */
export function actionItemAt(
  result: MultiProjectScanResult,
  collapsed: ReadonlyArray<ToolId>,
  pending: ReadonlyArray<{ id: string; action: "disable" | "enable" }>,
  cursor: number
): ActionsItem | undefined {
  const desired = makeDesiredDisabled(pending);
  return buildActionsModel(result, new Set(collapsed), desired).items[cursor];
}

export function resolveActionSkill(
  result: MultiProjectScanResult,
  selection: SkillActionSelection
): Skill | undefined {
  const skills = collectActionSkills(result);
  return (
    skills.find((skill) => skill.id === selection.id) ??
    skills.find(
      (skill) =>
        skill.toolId === selection.toolId &&
        skill.kind === selection.kind &&
        skill.name === selection.name
    )
  );
}

export function applySkillActionResult(
  result: MultiProjectScanResult,
  target: Skill,
  action: "disable" | "enable",
  newSourcePath: string
): MultiProjectScanResult {
  const disabled = action === "disable";
  let changed = false;
  const tools = result.userScope.tools.map((tool) => {
    if (tool.id !== target.toolId) return tool;
    const skills = tool.skills.map((skill) => {
      if (skill.id !== target.id) return skill;
      changed = true;
      const nextDetails = withDisabledState(skill.details, disabled);
      return {
        ...skill,
        id: createSkillId({
          toolId: skill.toolId,
          kind: skill.kind,
          name: skill.name,
          sourcePath: newSourcePath
        }),
        sourcePath: newSourcePath,
        ...(nextDetails ? { details: nextDetails } : { details: undefined })
      };
    });
    return changed ? { ...tool, skills } : tool;
  });

  if (!changed) return result;
  return {
    ...result,
    userScope: {
      ...result.userScope,
      tools
    }
  };
}

export function withDisabledState(
  details: Skill["details"],
  disabled: boolean
): Skill["details"] {
  if (disabled) {
    return { ...(details ?? {}), disabled: true };
  }
  if (!details) return undefined;
  const { disabled: _disabled, ...rest } = details;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function formatSkillActionFailure(
  action: "disable" | "enable",
  skill: Skill,
  reason: Extract<SkillWriterResult, { ok: false }>["reason"]
): string {
  const verb = action === "disable" ? "disable" : "enable";
  let reasonText: string;
  switch (reason) {
    case "target_exists":
      reasonText = "target already exists";
      break;
    case "source_missing":
      reasonText = "source is missing";
      break;
    case "outside_allowed_roots":
      reasonText = "path is outside allowed roots";
      break;
    default: {
      const _exhaustive: never = reason;
      reasonText = _exhaustive;
    }
  }
  return `Could not ${verb} ${skill.toolId}/${skill.name}: ${reasonText}`;
}

export function formatSkillActionUnexpectedFailure(
  action: "disable" | "enable",
  skill: Skill
): string {
  const verb = action === "disable" ? "disable" : "enable";
  return `Could not ${verb} ${skill.toolId}/${skill.name}: operation failed`;
}
