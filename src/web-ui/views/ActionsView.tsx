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
import { applyActions, type ActionRequest } from "../api.js";

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
  const allSkills = selectedTool ? selectedTool.skills.filter(isMarkdownSkill) : [];
  const enabled = allSkills.filter((s) => !desiredDisabled(s));
  const disabled = allSkills.filter((s) => desiredDisabled(s));

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
        <div className="actions-columns">
          <ColumnList
            title="Enabled"
            tone="ok"
            skills={enabled}
            pending={pending}
            onToggle={toggle}
            actionLabel="disable"
            emptyText="none enabled."
          />
          <ColumnList
            title="Disabled"
            tone="dim"
            skills={disabled}
            pending={pending}
            onToggle={toggle}
            actionLabel="enable"
            emptyText="none disabled."
          />
        </div>
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

function ColumnList(props: {
  title: string;
  tone: "ok" | "dim";
  skills: Skill[];
  pending: PendingChange[];
  onToggle: (s: Skill) => void;
  actionLabel: "enable" | "disable";
  emptyText: string;
}): React.ReactElement {
  return (
    <div className="actions-col">
      <h3>
        <span className={props.tone}>{props.tone === "ok" ? "●" : "○"}</span>{" "}
        {props.title}
        <span className="dim">{` (${props.skills.length})`}</span>
      </h3>
      {props.skills.length === 0 ? (
        <div className="empty-whisper">{props.emptyText}</div>
      ) : (
        props.skills.map((s) => {
          const staged = props.pending.some((p) => p.id === s.id);
          return (
            <div className="skill-line" key={s.id}>
              <span className="name">{s.name}</span>
              {staged && <span className="dim">pending</span>}
              <button className="action" onClick={() => props.onToggle(s)}>
                {props.actionLabel}
              </button>
            </div>
          );
        })
      )}
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
