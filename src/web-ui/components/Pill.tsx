import React from "react";

export type PillVariant =
  | "bundle"
  | "yours"
  | "builtin"
  | "danger"
  | "warn"
  | "info"
  | "ok"
  | "muted";

export interface PillProps {
  variant: PillVariant;
  children: React.ReactNode;
}

export function Pill({ variant, children }: PillProps): React.ReactElement {
  return <span className={`ank-pill ank-pill-${variant}`}>{children}</span>;
}
