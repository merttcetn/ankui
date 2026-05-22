import React, { useMemo, useState } from "react";

import type { MultiProjectScanResult, Skill } from "../../types.js";
import {
  buildActionsModel,
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
  const model = useMemo(
    () => buildActionsModel(props.scan, new Set(), desiredDisabled),
    [props.scan, desiredDisabled]
  );

  const toggle = (skill: Skill): void => {
    const nextDisabled = !desiredDisabled(skill);
    const diskDisabled = skill.details?.disabled === true;
    setPending((prev) => {
      const without = prev.filter((p) => p.id !== skill.id);
      // Toggling back to the on-disk state cancels the pending change.
      if (nextDisabled === diskDisabled) return without;
      return [
        ...without,
        { id: skill.id, action: nextDisabled ? "disable" : "enable" }
      ];
    });
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
      setPending([]);
      props.onScan(res.scan);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="action"
          disabled={saving || pending.length === 0}
          onClick={() => void save()}
        >
          {saving ? "saving…" : `save (${pending.length})`}
        </button>
        {status && <span className="dim">{status}</span>}
      </div>

      {model.items.map((item) => {
        if (item.type === "header") {
          return (
            <h3 key={`hdr:${item.toolId}`} style={{ marginTop: 14 }}>
              {item.name}{" "}
              <span className="dim">
                ● {item.enabled} ○ {item.disabled}
              </span>
            </h3>
          );
        }
        const skill = item.skill;
        const off = desiredDisabled(skill);
        const staged = pending.some((p) => p.id === skill.id);
        return (
          <div className="skill-line" key={skill.id}>
            <span className={off ? "dim" : "ok"}>{off ? "○" : "●"}</span>
            <span className="name">{skill.name}</span>
            {staged && <span className="dim">pending</span>}
            <button className="action" onClick={() => toggle(skill)}>
              {off ? "enable" : "disable"}
            </button>
          </div>
        );
      })}
    </>
  );
}
