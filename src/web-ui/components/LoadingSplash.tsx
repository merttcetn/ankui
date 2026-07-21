import React from "react";

import { SCAN_COMPLETE } from "../../tui/messages.js";
import { useRotatingMessage } from "../../tui/hooks/use-rotating-message.js";
import { DotMatrixCoreSpiral } from "./DotMatrixCoreSpiral.js";

interface Props {
  phase: "loading" | "done";
}

export function LoadingSplash({ phase }: Props): React.ReactElement {
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

  return (
    <div className="splash">
      <DotMatrixCoreSpiral size={76} dotSize={7} />
      <div key={index} className="splash-message">
        {message}
      </div>
      <div className="splash-hint">local files only · read-only scans</div>
    </div>
  );
}
