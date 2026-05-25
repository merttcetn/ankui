import React, { useEffect, useMemo, useState } from "react";

import type {
  AITool,
  MultiProjectScanResult,
  Skill,
  ToolId
} from "../../types.js";
import {
  isMarkdownSkill,
  makeDesiredDisabled
} from "../../tui/util/actions-items.js";
import { groupSkillsByOrigin, type SkillGroup } from "../../utils/skill-groups.js";
import { applyActions, type ActionRequest } from "../api.js";
import {
  SkillGroupSection,
  type BulkAction
} from "../components/SkillGroupSection.js";
import { useExpandedGroups } from "../hooks/useExpandedGroups.js";

interface PendingChange {
  id: string;
  action: "disable" | "enable";
}

export function ActionsView(props: {
  scan: MultiProjectScanResult;
  onScan: (scan: MultiProjectScanResult) => void;
}): React.ReactElement {
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const desiredDisabled = useMemo(() => makeDesiredDisabled(pending), [pending]);

  const tools = useMemo(
    () => props.scan.userScope.tools.filter((t) => t.skills.some(isMarkdownSkill)),
    [props.scan]
  );

  const [selectedToolId, setSelectedToolId] = useState<ToolId | null>(null);
  useEffect(() => {
    if (selectedToolId === null || !tools.some((t) => t.id === selectedToolId)) {
      setSelectedToolId(tools[0]?.id ?? null);
    }
  }, [tools, selectedToolId]);

  const selectedTool = tools.find((t) => t.id === selectedToolId);
  const allSkills = useMemo(
    () => (selectedTool ? selectedTool.skills.filter(isMarkdownSkill) : []),
    [selectedTool]
  );
  const groups = useMemo(() => groupSkillsByOrigin(allSkills), [allSkills]);
  const { isExpanded, toggle: toggleGroup } = useExpandedGroups("actions");

  const toggle = (skill: Skill): void => {
    const nextDisabled = !desiredDisabled(skill);
    const diskDisabled = skill.details?.disabled === true;
    setPending((prev) => {
      const without = prev.filter((p) => p.id !== skill.id);
      if (nextDisabled === diskDisabled) return without;
      return [
        ...without,
        { id: skill.id, action: nextDisabled ? "disable" : "enable" }
      ];
    });
  };

  /**
   * Stage bulk changes for a list of skills. We compare against on-disk state
   * (not the staged-future state) so already-staged matching changes get
   * replaced with no-ops, and changes that would match disk get dropped.
   */
  const stageBulk = (skills: Skill[], action: "disable" | "enable"): void => {
    setPending((prev) => {
      const ids = new Set(skills.map((s) => s.id));
      const next = prev.filter((p) => !ids.has(p.id));
      for (const skill of skills) {
        const diskDisabled = skill.details?.disabled === true;
        const wouldBeDisabled = action === "disable";
        if (diskDisabled === wouldBeDisabled) continue; // matches disk → no-op
        next.push({ id: skill.id, action });
      }
      return next;
    });
  };

  const handleBulk = (group: SkillGroup, action: BulkAction): void => {
    if (action === "disable-all") {
      const targets = group.skills.filter((s) => !desiredDisabled(s));
      stageBulk(targets, "disable");
    } else {
      const targets = group.skills.filter((s) => desiredDisabled(s));
      stageBulk(targets, "enable");
    }
  };

  const bulkFor = (
    group: SkillGroup
  ): "disable-all" | "enable-all" | "both" | "none" => {
    if (group.alwaysExpanded) return "none";
    if (group.skills.length === 0) return "none";
    const enabled = group.skills.filter((s) => !desiredDisabled(s)).length;
    const disabled = group.skills.length - enabled;
    if (enabled === 0) return "enable-all";
    if (disabled === 0) return "disable-all";
    return "both";
  };

  const discard = (): void => {
    setPending([]);
    setStatus(null);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setStatus(null);
    try {
      const changes: ActionRequest[] = pending.map((p) => ({
        skillId: p.id,
        action: p.action
      }));
      const res = await applyActions(changes);
      const failed = res.outcomes.filter((o) => !o.ok);
      setStatus(
        failed.length === 0
          ? `saved ${res.outcomes.length} change(s)`
          : `${failed.length} failed: ${failed[0].message}`
      );
      const failedIds = new Set(failed.map((o) => o.skillId));
      setPending((prev) => prev.filter((p) => failedIds.has(p.id)));
      props.onScan(res.scan);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const hasPending = pending.length > 0;

  return (
    <>
      <ActionsToolNav
        tools={tools}
        selectedId={selectedToolId}
        onSelect={setSelectedToolId}
        desiredDisabled={desiredDisabled}
      />

      <div className="tab-panel" key={selectedToolId ?? "none"}>
        {groups.length === 0 ? (
          <div className="empty-whisper">no skills here.</div>
        ) : (
          groups.map((group) => (
            <SkillGroupSection
              key={group.label}
              group={group}
              expanded={isExpanded(group.label, group.alwaysExpanded)}
              onToggle={() => toggleGroup(group.label)}
              onBulkAction={(action) => handleBulk(group, action)}
              bulkAvailable={bulkFor(group)}
            >
              {group.skills.map((skill) => {
                const isDisabled = desiredDisabled(skill);
                const staged = pending.some((p) => p.id === skill.id);
                return (
                  <div className="skill-line" key={skill.id}>
                    <span className={isDisabled ? "dim" : "ok"}>
                      {isDisabled ? "○" : "●"}
                    </span>
                    <span className="name">{skill.name}</span>
                    {staged && <span className="dim">pending</span>}
                    <button className="action" onClick={() => toggle(skill)}>
                      {isDisabled ? "enable" : "disable"}
                    </button>
                  </div>
                );
              })}
            </SkillGroupSection>
          ))
        )}
      </div>

      {hasPending && (
        <ActionsFloatBar
          pending={pending.length}
          saving={saving}
          status={status}
          onSave={() => void save()}
          onDiscard={discard}
        />
      )}
      {status && !hasPending && <div className="actions-status">{status}</div>}
    </>
  );
}

function ActionsToolNav(props: {
  tools: AITool[];
  selectedId: ToolId | null;
  onSelect: (id: ToolId) => void;
  desiredDisabled: (s: Skill) => boolean;
}): React.ReactElement {
  return (
    <div className="actions-toolnav">
      {props.tools.map((tool) => {
        const md = tool.skills.filter(isMarkdownSkill);
        const total = md.length;
        const off = md.filter(props.desiredDisabled).length;
        const on = total - off;
        return (
          <button
            key={tool.id}
            className={tool.id === props.selectedId ? "active" : ""}
            onClick={() => props.onSelect(tool.id)}
          >
            {tool.name}
            <span className="dim">{` · ${on}/${total}`}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActionsFloatBar(props: {
  pending: number;
  saving: boolean;
  status: string | null;
  onSave: () => void;
  onDiscard: () => void;
}): React.ReactElement {
  return (
    <div className="actions-float" role="status" aria-live="polite">
      <span className="count">{props.pending} pending</span>
      <button
        className="action"
        onClick={props.onDiscard}
        disabled={props.saving}
      >
        discard
      </button>
      <button
        className="action primary"
        onClick={props.onSave}
        disabled={props.saving}
      >
        {props.saving ? "saving…" : "save"}
      </button>
      {props.status && <span className="dim">{props.status}</span>}
    </div>
  );
}
