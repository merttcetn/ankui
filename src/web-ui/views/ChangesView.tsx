import React, { useEffect, useMemo, useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { diffSnapshots } from "../../snapshots/diff.js";
import type {
  SnapshotDiffChange,
  SnapshotDiffResult,
  SnapshotDocument,
  SnapshotMetadata
} from "../../snapshots/types.js";
import {
  createSnapshot,
  fetchSnapshot,
  fetchSnapshotState,
  removeSnapshot,
  type SnapshotStateResponse
} from "../api.js";
import { DetailHeader } from "../components/DetailHeader.js";

export function ChangesPanel(props: {
  scan: MultiProjectScanResult;
  onScan: (scan: MultiProjectScanResult) => void;
}): React.ReactElement {
  const [state, setState] = useState<SnapshotStateResponse | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("current");
  const [fromDocument, setFromDocument] = useState<SnapshotDocument | null>(null);
  const [toDocument, setToDocument] = useState<SnapshotDocument | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"load" | "create" | "delete" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchSnapshotState()
      .then((next) => {
        if (cancelled) return;
        installState(next, setState, setFromId, setFromDocument, setToId, setToDocument);
        props.onScan(next.scan);
      })
      .catch((reason) => { if (!cancelled) setError(formatError(reason)); })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!state || !fromId) return;
    if (state.latest?.id === fromId) {
      setFromDocument(state.latest);
      return;
    }
    let cancelled = false;
    fetchSnapshot(fromId)
      .then((document) => { if (!cancelled) setFromDocument(document); })
      .catch((reason) => { if (!cancelled) setError(formatError(reason)); });
    return () => { cancelled = true; };
  }, [fromId, state]);

  useEffect(() => {
    if (!state) return;
    if (toId === "current") {
      setToDocument(state.current);
      return;
    }
    let cancelled = false;
    fetchSnapshot(toId)
      .then((document) => { if (!cancelled) setToDocument(document); })
      .catch((reason) => { if (!cancelled) setError(formatError(reason)); });
    return () => { cancelled = true; };
  }, [toId, state]);

  const fromMeta = state?.snapshots.find((snapshot) => snapshot.id === fromId);
  const toOptions = useMemo(() => {
    if (!state || !fromMeta) return [];
    return state.snapshots.filter((snapshot) =>
      snapshot.id !== fromMeta.id && snapshot.createdAt >= fromMeta.createdAt
    );
  }, [state, fromMeta]);

  const diff = useMemo<SnapshotDiffResult | null>(() => {
    if (!fromDocument || !toDocument) return null;
    return diffSnapshots(fromDocument, toDocument, { toCurrent: toId === "current" });
  }, [fromDocument, toDocument, toId]);

  async function handleCreate(): Promise<void> {
    setBusy("create");
    setError(null);
    try {
      const next = await createSnapshot(label);
      installState(next, setState, setFromId, setFromDocument, setToId, setToDocument);
      props.onScan(next.scan);
      setLabel("");
      setAnnouncement("Snapshot created. The current drift is now zero.");
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!fromMeta) return;
    if (!window.confirm(`Delete snapshot ${fromMeta.label ?? shortId(fromMeta.id)}?`)) return;
    setBusy("delete");
    setError(null);
    try {
      const next = await removeSnapshot(fromMeta.id);
      installState(next, setState, setFromId, setFromDocument, setToId, setToDocument);
      props.onScan(next.scan);
      setAnnouncement("Snapshot deleted.");
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DetailHeader
        crumb="CHANGES / LOCAL LEDGER"
        title="Configuration drift"
        meta="SEMANTIC SNAPSHOTS · LOCAL ONLY · NO RAW FILE CONTENT"
      />
      <div className="ank-view-body changes-view">
        <div className="changes-atmosphere" aria-hidden />
        <section className="changes-capture" aria-labelledby="changes-capture-title">
          <div>
            <div className="changes-kicker">NEW BASELINE</div>
            <h4 id="changes-capture-title">Mark this moment.</h4>
            <p>Capture every registered project without storing previews or secret values.</p>
          </div>
          <div className="changes-capture-form">
            <label htmlFor="snapshot-label">Optional label</label>
            <div>
              <input
                id="snapshot-label"
                value={label}
                maxLength={80}
                placeholder="before dependency upgrade"
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !busy) void handleCreate();
                }}
              />
              <button className="changes-primary" type="button" onClick={() => void handleCreate()} disabled={busy !== null}>
                {busy === "create" ? "capturing…" : "Create snapshot"}
              </button>
            </div>
          </div>
        </section>

        {error && <div className="changes-error" role="alert">{error}</div>}
        <div className="sr-only" aria-live="polite">{announcement}</div>
        {busy === "load" && <div className="changes-loading"><span /> Reading the local ledger…</div>}
        {state && state.snapshots.length === 0 && busy !== "load" && (
          <div className="changes-empty"><b>NO BASELINE</b><p>Create the first snapshot to make future drift visible.</p></div>
        )}

        {state && state.snapshots.length > 0 && fromMeta && (
          <>
            <section className="changes-timebar" aria-label="Comparison range">
              <TimeSelector
                label="FROM"
                value={fromId}
                snapshots={state.snapshots}
                onChange={(value) => {
                  setFromDocument(null);
                  setFromId(value);
                  const nextFrom = state.snapshots.find((snapshot) => snapshot.id === value);
                  const currentTarget = state.snapshots.find((snapshot) => snapshot.id === toId);
                  if (toId !== "current" && nextFrom && (!currentTarget || currentTarget.createdAt < nextFrom.createdAt)) {
                    setToId("current");
                  }
                }}
              />
              <div className="changes-axis" aria-hidden><span /><i>DRIFT</i><span /></div>
              <div className="changes-selector">
                <label htmlFor="changes-to">TO</label>
                <select id="changes-to" value={toId} onChange={(event) => {
                  setToDocument(null);
                  setToId(event.target.value);
                }}>
                  <option value="current">Current scan</option>
                  {toOptions.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>{snapshotOption(snapshot)}</option>
                  ))}
                </select>
                <span className="changes-time">{toId === "current" ? formatDate(state.current.createdAt) : formatDate(toDocument?.createdAt)}</span>
              </div>
              <button className="changes-delete" type="button" onClick={() => void handleDelete()} disabled={busy !== null}>
                Delete baseline
              </button>
            </section>
            {diff && <DiffLedger diff={diff} />}
          </>
        )}
        {state && state.warnings.length > 0 && (
          <aside className="changes-store-warnings">
            {state.warnings.length} unreadable snapshot file(s) were preserved for manual review.
          </aside>
        )}
      </div>
    </>
  );
}

function DiffLedger({ diff }: { diff: SnapshotDiffResult }): React.ReactElement {
  const inventoryChanges = diff.changes.filter((change) => change.kind !== "warning");
  const healthChanges = diff.changes.filter((change) => change.kind === "warning");
  const inventory = diff.summary.total === 0 ? (
      <section className="changes-zero">
        <span className="changes-zero-mark" aria-hidden>○</span>
        <div>
          <strong>No reliable semantic drift</strong>
          <p>Incomplete adapter scans are excluded from inventory changes.</p>
        </div>
      </section>
  ) : <InventoryLedger diff={diff} changes={inventoryChanges} />;
  return (
    <>{inventory}{healthChanges.length > 0 && <ScanHealth changes={healthChanges} diff={diff} />}</>
  );
}

function InventoryLedger(props: {
  diff: SnapshotDiffResult;
  changes: SnapshotDiffChange[];
}): React.ReactElement {
  const groups: Array<{ type: SnapshotDiffChange["type"]; label: string }> = [
    { type: "added", label: "Entered the surface" },
    { type: "modified", label: "Changed in place" },
    { type: "removed", label: "Left the surface" }
  ];
  return (
    <section className="changes-ledger" aria-label="Semantic changes">
      <header className="changes-ledger-head">
        <div><span>{props.diff.summary.total}</span><small>total changes</small></div>
        <div className="changes-totals">
          <b className="is-added">+{props.diff.summary.added}</b>
          <b className="is-modified">~{props.diff.summary.modified}</b>
          <b className="is-removed">−{props.diff.summary.removed}</b>
        </div>
      </header>
      {groups.map((group) => {
        const changes = props.changes.filter((change) => change.type === group.type);
        if (changes.length === 0) return null;
        return (
          <div className={`changes-group is-${group.type}`} key={group.type}>
            <div className="changes-group-title"><span>{group.label}</span><b>{changes.length}</b></div>
            {changes.map((change) => <ChangeRow key={change.key} change={change} />)}
          </div>
        );
      })}
    </section>
  );
}

function ScanHealth(props: {
  changes: SnapshotDiffChange[];
  diff: SnapshotDiffResult;
}): React.ReactElement {
  return (
    <section className="changes-health" aria-label="Scan health changes">
      <header>
        <div><span>SCAN HEALTH</span><strong>{props.diff.summary.scanHealth.total}</strong></div>
        <p>Transient scanner warnings are shown separately and never count as configuration drift.</p>
      </header>
      {props.changes.map((change) => (
        <article key={`${change.type}:${change.key}`}>
          <span className={change.type === "added" ? "is-new" : "is-resolved"}>
            {change.type === "added" ? "NEW" : "RESOLVED"}
          </span>
          <div><strong>{change.label}</strong><small>{displayContext(change.context)}</small></div>
        </article>
      ))}
    </section>
  );
}

function ChangeRow({ change }: { change: SnapshotDiffChange }): React.ReactElement {
  const symbol = change.type === "added" ? "+" : change.type === "removed" ? "−" : "~";
  return (
    <article className="changes-row">
      <span className="changes-symbol" aria-label={change.type}>{symbol}</span>
      <div className="changes-row-main">
        <div><strong>{change.label}</strong><span>{change.kind} · {displayContext(change.context)}</span></div>
        {change.fields.length > 0 && (
          <dl>{change.fields.map((field) => (
            <div key={field.field}>
              <dt>{field.field}</dt>
              <dd><code>{displayValue(field.before)}</code><i>→</i><code>{displayValue(field.after)}</code></dd>
            </div>
          ))}</dl>
        )}
      </div>
    </article>
  );
}

function TimeSelector(props: {
  label: string;
  value: string;
  snapshots: SnapshotMetadata[];
  onChange: (value: string) => void;
}): React.ReactElement {
  const selected = props.snapshots.find((snapshot) => snapshot.id === props.value);
  return (
    <div className="changes-selector">
      <label htmlFor="changes-from">{props.label}</label>
      <select id="changes-from" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>{snapshotOption(snapshot)}</option>
        ))}
      </select>
      <span className="changes-time">{formatDate(selected?.createdAt)}</span>
    </div>
  );
}

function installState(
  next: SnapshotStateResponse,
  setState: (value: SnapshotStateResponse) => void,
  setFromId: (value: string) => void,
  setFromDocument: (value: SnapshotDocument | null) => void,
  setToId: (value: string) => void,
  setToDocument: (value: SnapshotDocument | null) => void
): void {
  setState(next);
  setFromId(next.latest?.id ?? "");
  setFromDocument(next.latest ?? null);
  setToId("current");
  setToDocument(next.current);
}

function snapshotOption(snapshot: SnapshotMetadata): string {
  return snapshot.label ?? `${formatDate(snapshot.createdAt)} · ${shortId(snapshot.id)}`;
}

function shortId(id: string): string {
  return id.slice(-8);
}

function formatDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function displayContext(context: string): string {
  return context === "user" ? "user scope" : context.replace(/^project:/, "");
}

function displayValue(value: unknown): string {
  if (value === undefined) return "∅";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
