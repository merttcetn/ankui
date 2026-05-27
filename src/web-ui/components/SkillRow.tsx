import React from "react";

import { Pill, type PillVariant } from "./Pill.js";

export interface SkillRowProps {
  /** Pill variant for the leading tag (origin / kind / severity). */
  pill?: { variant: PillVariant; label: string };
  /** Primary text — usually the skill / item name. */
  name: React.ReactNode;
  /** Optional dim mono caption (source path, kind, etc.). */
  source?: React.ReactNode;
  /** Optional trailing element (button, status). */
  trailing?: React.ReactNode;
}

export function SkillRow({ pill, name, source, trailing }: SkillRowProps): React.ReactElement {
  return (
    <div className="ank-row">
      {pill && <Pill variant={pill.variant}>{pill.label}</Pill>}
      <span className="ank-row-name">{name}</span>
      {source && <span className="ank-row-src">{source}</span>}
      {trailing}
    </div>
  );
}
