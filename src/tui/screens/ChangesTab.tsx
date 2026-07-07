import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { MultiProjectScanResult } from "../../types.js";
import { diffSnapshots } from "../../snapshots/diff.js";
import { buildSnapshotDocument } from "../../snapshots/model.js";
import { captureSnapshot } from "../../snapshots/service.js";
import { deleteSnapshot, listSnapshots, readSnapshot } from "../../snapshots/store.js";
import type {
  SnapshotDiffResult,
  SnapshotDocument,
  SnapshotMetadata
} from "../../snapshots/types.js";
import { SectionHeader } from "../components/SectionHeader.js";
import { usePanelWidth } from "../util/panel-width.js";

export function ChangesTab(props: {
  result: MultiProjectScanResult;
  active: boolean;
  onResult: (result: MultiProjectScanResult) => void;
}): React.ReactElement {
  const [snapshots, setSnapshots] = useState<SnapshotMetadata[]>([]);
  const [from, setFrom] = useState<SnapshotDocument | null>(null);
  const [to, setTo] = useState<SnapshotDocument>(() => currentDocument(props.result));
  const [targetId, setTargetId] = useState("current");
  const [focus, setFocus] = useState<"from" | "to">("from");
  const [status, setStatus] = useState("loading snapshots…");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const width = usePanelWidth();

  useEffect(() => {
    let cancelled = false;
    void listSnapshots(props.result.homeDir)
      .then(async (listed) => {
        if (cancelled) return;
        setSnapshots(listed.snapshots);
        if (listed.snapshots[0]) {
          const latest = await readSnapshot(props.result.homeDir, listed.snapshots[0].id);
          if (!cancelled) setFrom(latest);
        }
        if (!cancelled) setStatus(listed.warnings.length > 0 ? `${listed.warnings.length} unreadable snapshot(s)` : "");
      })
      .catch((error) => { if (!cancelled) setStatus(formatError(error)); });
    return () => { cancelled = true; };
  }, [props.result.homeDir]);

  useEffect(() => {
    if (targetId === "current") setTo(currentDocument(props.result));
  }, [props.result, targetId]);

  const fromMeta = snapshots.find((snapshot) => snapshot.id === from?.id);
  const toOptions = useMemo(() => {
    if (!fromMeta) return snapshots;
    return snapshots.filter((snapshot) =>
      snapshot.id !== fromMeta.id && snapshot.createdAt >= fromMeta.createdAt
    );
  }, [snapshots, fromMeta]);
  const targetOptions = ["current", ...toOptions.map((snapshot) => snapshot.id)];
  const diff = from ? diffSnapshots(from, to, { toCurrent: targetId === "current" }) : null;

  useInput((input, key) => {
    if (busy) return;
    if (confirmDelete) {
      if (input.toLowerCase() === "y") void removeSelected();
      else if (input.toLowerCase() === "n") setConfirmDelete(false);
      return;
    }
    if (key.tab) {
      setFocus((current) => current === "from" ? "to" : "from");
      return;
    }
    if (key.upArrow || key.downArrow) {
      const delta = key.downArrow ? 1 : -1;
      const selection = focus === "from" ? selectFrom(delta) : selectTo(delta);
      void selection.catch((error) => setStatus(formatError(error)));
      return;
    }
    if (input.toLowerCase() === "n") void createNew();
    if (input.toLowerCase() === "d" && from) setConfirmDelete(true);
  }, { isActive: props.active });

  async function selectFrom(delta: number): Promise<void> {
    if (snapshots.length === 0) return;
    const currentIndex = Math.max(0, snapshots.findIndex((snapshot) => snapshot.id === from?.id));
    const next = snapshots[wrap(currentIndex + delta, snapshots.length)];
    const document = await readSnapshot(props.result.homeDir, next.id);
    setFrom(document);
    if (targetId !== "current") {
      const selectedTarget = snapshots.find((snapshot) => snapshot.id === targetId);
      if (!selectedTarget || selectedTarget.createdAt < next.createdAt) {
        setTargetId("current");
        setTo(currentDocument(props.result));
      }
    }
  }

  async function selectTo(delta: number): Promise<void> {
    const index = Math.max(0, targetOptions.indexOf(targetId));
    const next = targetOptions[wrap(index + delta, targetOptions.length)];
    setTargetId(next);
    setTo(next === "current"
      ? currentDocument(props.result)
      : await readSnapshot(props.result.homeDir, next));
  }

  async function createNew(): Promise<void> {
    setBusy(true);
    setStatus("capturing fresh inventory…");
    try {
      const captured = await captureSnapshot({ homeDir: props.result.homeDir });
      const listed = await listSnapshots(props.result.homeDir);
      setSnapshots(listed.snapshots);
      setFrom(captured.document);
      setTargetId("current");
      setTo(currentDocument(captured.scan));
      props.onResult(captured.scan);
      setStatus("snapshot created · drift reset to zero");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected(): Promise<void> {
    if (!from) return;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await deleteSnapshot(props.result.homeDir, from.id);
      const listed = await listSnapshots(props.result.homeDir);
      setSnapshots(listed.snapshots);
      const next = listed.snapshots[0]
        ? await readSnapshot(props.result.homeDir, listed.snapshots[0].id)
        : null;
      setFrom(next);
      setTargetId("current");
      setTo(currentDocument(props.result));
      setStatus("snapshot deleted");
    } catch (error) {
      setStatus(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column">
      <SectionHeader label="CHANGES · LOCAL LEDGER" underlineWidth={width} />
      <Text dimColor>semantic snapshots · no raw file content · latest → current by default</Text>
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Selector label="FROM" active={focus === "from"} value={snapshotLabel(fromMeta)} />
        <Text color="yellow">  ─── DRIFT ───  </Text>
        <Selector label="TO" active={focus === "to"} value={targetId === "current" ? "current scan" : snapshotLabel(snapshots.find((s) => s.id === targetId))} />
      </Box>
      {confirmDelete && (
        <Box marginTop={1}><Text color="red">Delete selected baseline? [y] yes · [n] no</Text></Box>
      )}
      {status && <Box marginTop={1}><Text dimColor>{status}</Text></Box>}
      {!from && !busy ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>No baseline yet.</Text>
          <Text dimColor>Press [n] to capture the first snapshot.</Text>
        </Box>
      ) : diff ? <DiffBoard diff={diff} /> : null}
    </Box>
  );
}

function Selector(props: { label: string; active: boolean; value: string }): React.ReactElement {
  return (
    <Box flexGrow={1}>
      <Text color={props.active ? "yellow" : undefined} bold={props.active}>{props.active ? "●" : "○"} {props.label} </Text>
      <Text>{props.value}</Text>
    </Box>
  );
}

function DiffBoard({ diff }: { diff: SnapshotDiffResult }): React.ReactElement {
  const inventoryChanges = diff.changes.filter((change) => change.kind !== "warning");
  return (
    <Box marginTop={1} flexDirection="column">
      {diff.summary.total === 0 ? (
        <Text color="green">○ No reliable semantic drift.</Text>
      ) : <>
        <Text bold>{diff.summary.total} changes</Text>
        <Text>
          <Text color="green">+{diff.summary.added} added</Text>
          <Text> · </Text>
          <Text color="yellow">~{diff.summary.modified} modified</Text>
          <Text> · </Text>
          <Text color="red">-{diff.summary.removed} removed</Text>
        </Text>
      </>}
      {inventoryChanges.slice(0, 12).map((change) => (
        <Box key={`${change.type}:${change.key}`}>
          <Text color={change.type === "added" ? "green" : change.type === "removed" ? "red" : "yellow"}>
            {change.type === "added" ? "+" : change.type === "removed" ? "-" : "~"}{" "}
          </Text>
          <Text>{change.label}</Text>
          <Text dimColor> · {change.kind} · {change.context === "user" ? "user" : change.context.replace(/^project:/, "")}</Text>
        </Box>
      ))}
      {inventoryChanges.length > 12 && <Text dimColor>… {inventoryChanges.length - 12} more</Text>}
      {diff.summary.scanHealth.total > 0 && (
        <Text dimColor>
          scan health · {diff.summary.scanHealth.added} new · {diff.summary.scanHealth.removed} resolved warning(s)
        </Text>
      )}
    </Box>
  );
}

function currentDocument(result: MultiProjectScanResult): SnapshotDocument {
  return buildSnapshotDocument(result, { id: "current", createdAt: result.scannedAt });
}

function snapshotLabel(snapshot: SnapshotMetadata | undefined): string {
  if (!snapshot) return "none";
  return snapshot.label ?? `${snapshot.createdAt.slice(0, 16).replace("T", " ")} · ${snapshot.id.slice(-8)}`;
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
