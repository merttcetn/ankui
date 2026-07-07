import React, { useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { relativizeHome } from "../../utils/paths.js";
import { applyConfig } from "../api.js";
import { Banner } from "../components/Banner.js";
import { DetailHeader } from "../components/DetailHeader.js";
import { EntityRail } from "../components/EntityRail.js";
import { SectionLabel } from "../components/SectionLabel.js";

export interface SettingsViewProps {
  scan: MultiProjectScanResult;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onScan: (s: MultiProjectScanResult) => void;
}

/**
 * Pure-function settings shell (zero hooks). The form sub-panel manages its own
 * transient state (input text, busy flag, error) — it's a real JSX-rendered
 * React component, so its hooks register against the right instance.
 */
export function SettingsView(props: SettingsViewProps): {
  rail: React.ReactNode;
  detail: React.ReactNode;
} {
  const devRoots = props.scan.devRoots;
  const selectedId = props.selectedId ?? "dev-roots";

  const rail = (
    <EntityRail
      sections={[
        {
          heading: "settings",
          items: [{ id: "dev-roots", label: "dev roots", count: devRoots.length }]
        }
      ]}
      selectedId={selectedId}
      onSelect={props.onSelectId}
    />
  );

  const detail = (
    <DevRootsPanel
      scan={props.scan}
      onScan={props.onScan}
    />
  );

  return { rail, detail };
}

interface DevRootsPanelProps {
  scan: MultiProjectScanResult;
  onScan: (s: MultiProjectScanResult) => void;
}

function DevRootsPanel(props: DevRootsPanelProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const devRoots = props.scan.devRoots;
  const homeDir = props.scan.homeDir;

  const apply = async (next: string[]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await applyConfig(devRoots, next);
      props.onScan(res.scan);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (err && typeof err === "object" && "freshScan" in err) {
        const fresh = (err as { freshScan?: MultiProjectScanResult }).freshScan;
        if (fresh) props.onScan(fresh);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addRoot = (): void => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (devRoots.includes(trimmed)) {
      setInput("");
      return;
    }
    void apply([...devRoots, trimmed]).then((ok) => {
      if (ok) setInput("");
    });
  };

  const removeRoot = (root: string): void => {
    void apply(devRoots.filter((r) => r !== root));
  };

  const totalSkills =
    props.scan.totals.userScopeSkills + props.scan.totals.skillsAcrossProjects;
  const scanned = new Date(props.scan.scannedAt).toLocaleString();

  return (
    <>
      <DetailHeader
        crumb="SETTINGS / DEV ROOTS"
        title="dev roots"
        meta={`${devRoots.length} CONFIGURED · LAST SCAN ${scanned.toUpperCase()} · ${totalSkills} SKILLS`}
      />

      <div className="ank-view-body">
        {devRoots.length === 0 && (
          <div className="empty-whisper">
            no dev roots yet. add one below, or run <code>ankui discover --apply</code> from a terminal.
          </div>
        )}

        <SectionLabel count={devRoots.length}>configured</SectionLabel>
        {devRoots.map((root) => (
          <div className="ank-row" key={root}>
            <span className="ank-row-name">{relativizeHome(root, homeDir)}</span>
            <button
              className="action settings-remove"
              onClick={() => removeRoot(root)}
              disabled={busy}
              aria-label={`remove ${root}`}
            >
              ×
            </button>
          </div>
        ))}

        <div className="settings-add">
          <input
            type="text"
            value={input}
            placeholder="~/Developer or /Users/you/Developer"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addRoot();
            }}
          />
          <button
            className="action primary"
            onClick={addRoot}
            disabled={busy || input.trim() === ""}
          >
            {busy ? "saving…" : "add"}
          </button>
        </div>

        <div className="settings-footer">
          Paths beginning with <code>~</code> are expanded to your home directory.
        </div>

        {error && (
          <Banner variant="danger" badge="ERROR">{error}</Banner>
        )}
      </div>
    </>
  );
}
