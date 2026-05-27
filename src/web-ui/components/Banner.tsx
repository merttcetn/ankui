import React from "react";

import { Pill, type PillVariant } from "./Pill.js";

export interface BannerProps {
  /** Pill variant used for the leading badge. */
  variant: "danger" | "warn" | "info";
  /** Short uppercase label inside the pill (e.g. "DANGER", "SECRET"). */
  badge: string;
  /** Main banner message. */
  children: React.ReactNode;
  /** Optional trailing action (e.g. "REVIEW →"). */
  action?: React.ReactNode;
}

export function Banner({ variant, badge, children, action }: BannerProps): React.ReactElement {
  const variantPill: PillVariant = variant;
  return (
    <div className={`ank-banner ank-banner-${variant}`}>
      <Pill variant={variantPill}>{badge}</Pill>
      <span className="ank-banner-txt">{children}</span>
      {action && <span className="ank-banner-action">{action}</span>}
    </div>
  );
}
