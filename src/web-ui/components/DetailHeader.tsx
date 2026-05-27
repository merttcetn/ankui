import React from "react";

export interface DetailHeaderProps {
  /** Breadcrumb path, e.g. "TOOLS / CLAUDE". Rendered in mono caps. */
  crumb?: string;
  /** Main title (h3). */
  title: React.ReactNode;
  /** Optional mono meta line (e.g. "DETECTED · 5 PATHS · USER + 6 PROJECTS"). */
  meta?: React.ReactNode;
}

export function DetailHeader({ crumb, title, meta }: DetailHeaderProps): React.ReactElement {
  return (
    <header className="ank-detail-header">
      {crumb && <div className="ank-detail-crumb">{crumb}</div>}
      <h3 className="ank-detail-title">{title}</h3>
      {meta && <div className="ank-detail-meta">{meta}</div>}
    </header>
  );
}
