import React, { useEffect, useState } from "react";

import { SCAN_COMPLETE } from "../../tui/messages.js";
import { useRotatingMessage } from "../../tui/hooks/use-rotating-message.js";
import { SPINNER_FRAMES } from "../../tui/theme/icons.js";

interface Props {
  phase: "loading" | "done";
}

const FRAME_INTERVAL_MS = 100;

const SIGNALS = [
  "locating config roots",
  "reading tool manifests",
  "linking MCP access"
] as const;

export function LoadingSplash({ phase }: Props): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (phase !== "loading") return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % 10_000);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const { message, index } = useRotatingMessage({ active: phase === "loading" });

  if (phase === "done") {
    return (
      <div className="splash">
        <div className="splash-done">
          <span className="mark">◆</span>
          {SCAN_COMPLETE}
        </div>
      </div>
    );
  }

  const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  const activeSignal = Math.floor(frame / 8) % SIGNALS.length;

  return (
    <div className="splash">
      <div className="splash-header">
        <span className="mark">◌</span>
        <span>ankui</span>
        <span className="sep">·</span>
        <span>memory scan</span>
      </div>
      <div className="splash-body">
        <div className="splash-line">
          <span className="spinner">{glyph}</span>
          <span key={index} className="splash-message">{message}</span>
        </div>
        <div className="splash-signals">
          {SIGNALS.map((label, i) => {
            const active = i === activeSignal;
            return (
              <div
                key={label}
                className={active ? "splash-signal active" : "splash-signal"}
              >
                <span className="glyph">{active ? "◆" : "◇"}</span>
                <span>{label}</span>
                <span className="status">{active ? "scanning" : "queued"}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="splash-footer">local files only · read-only scan</div>
    </div>
  );
}
