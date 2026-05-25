import React from "react";

import { useIdleWhisper } from "../../tui/hooks/use-idle-whisper.js";

interface Props {
  enabled: boolean;
}

export function IdleWhisper({ enabled }: Props): React.ReactElement | null {
  const { whisper } = useIdleWhisper({ enabled });
  if (!whisper) return null;
  return (
    <div className="idle-whisper" key={whisper}>
      {whisper}
    </div>
  );
}
