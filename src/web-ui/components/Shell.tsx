import React from "react";

export interface ShellProps {
  sidebar: React.ReactNode;
  rail?: React.ReactNode;
  detail: React.ReactNode;
}

export function Shell({ sidebar, rail, detail }: ShellProps): React.ReactElement {
  const className = rail === undefined ? "ank-shell ank-shell-2pane" : "ank-shell ank-shell-3pane";
  return (
    <div className={className}>
      <aside className="ank-shell-side">{sidebar}</aside>
      {rail !== undefined && <aside className="ank-shell-rail">{rail}</aside>}
      <main className="ank-shell-detail">{detail}</main>
    </div>
  );
}
