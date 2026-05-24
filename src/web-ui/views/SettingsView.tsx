import React, { useState } from "react";

import type { MultiProjectScanResult } from "../../types.js";
import { relativizeHome } from "../../utils/paths.js";
import { applyConfig } from "../api.js";

export function SettingsView(props: {
  scan: MultiProjectScanResult;
  onScan: (s: MultiProjectScanResult) => void;
}): React.ReactElement {
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
    <div className="settings">
      <div className="row">
        <h3>
          dev roots <span className="dim">({devRoots.length})</span>
        </h3>

        {devRoots.length === 0 && (
          <div className="empty-whisper">
            no dev roots yet. add one below, or run{" "}
            <code>ankui discover --apply</code> from a terminal.
          </div>
        )}

        {devRoots.map((root) => (
          <div className="settings-row" key={root}>
            <span className="name">{relativizeHome(root, homeDir)}</span>
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
            placeholder="/Users/you/Developer"
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

        {error && <div className="banner danger">{error}</div>}
      </div>

      <div className="settings-footer">
        last scan · <span className="dim">{scanned}</span> ·{" "}
        <span className="dim">{totalSkills} skills</span>
      </div>
    </div>
  );
}
