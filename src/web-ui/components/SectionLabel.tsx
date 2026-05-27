import React from "react";

export interface SectionLabelProps {
  /** Main label text (will be rendered uppercase by CSS). */
  children: React.ReactNode;
  /** Optional dim count suffix (e.g. "· 64"). */
  count?: number;
  /** Optional trailing element (e.g. a filter chip row). */
  trailing?: React.ReactNode;
}

export function SectionLabel({ children, count, trailing }: SectionLabelProps): React.ReactElement {
  return (
    <div className="ank-sec">
      <span>
        {children}
        {count !== undefined && <span className="ank-sec-count"> · {count}</span>}
      </span>
      {trailing}
    </div>
  );
}
