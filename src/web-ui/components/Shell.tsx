import React from "react";

export interface ShellProps {
  sidebar: React.ReactNode;
  rail?: React.ReactNode;
  detail: React.ReactNode;
  activeLabel: string;
  sidebarOpen: boolean;
  railOpen: boolean;
  onToggleSidebar: () => void;
  onToggleRail: () => void;
  onCloseOverlays: () => void;
}

export function Shell({
  sidebar,
  rail,
  detail,
  activeLabel,
  sidebarOpen,
  railOpen,
  onToggleSidebar,
  onToggleRail,
  onCloseOverlays
}: ShellProps): React.ReactElement {
  const className = rail === undefined ? "ank-shell ank-shell-2pane" : "ank-shell ank-shell-3pane";
  return (
    <div className={className}>
      <header className="ank-mobile-bar">
        <button
          type="button"
          className="ank-mobile-trigger"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="ank-primary-nav"
        >
          <span aria-hidden>≡</span>
          <span className="sr-only">Toggle navigation</span>
        </button>
        <div>
          <span className="ank-mobile-brand">ankui</span>
          <strong>{activeLabel}</strong>
        </div>
        {rail !== undefined ? (
          <button
            type="button"
            className="ank-mobile-context"
            onClick={onToggleRail}
            aria-expanded={railOpen}
            aria-controls="ank-entity-rail"
          >
            Browse
          </button>
        ) : <span className="ank-mobile-context-spacer" />}
      </header>
      <aside
        id="ank-primary-nav"
        className={`ank-shell-side${sidebarOpen ? " is-open" : ""}`}
      >
        {sidebar}
      </aside>
      {rail !== undefined && (
        <aside
          id="ank-entity-rail"
          className={`ank-shell-rail${railOpen ? " is-open" : ""}`}
        >
          {rail}
        </aside>
      )}
      <main className="ank-shell-detail">{detail}</main>
      {(sidebarOpen || railOpen) && (
        <button
          type="button"
          className={`ank-shell-scrim${sidebarOpen ? " for-sidebar" : " for-rail"}`}
          onClick={onCloseOverlays}
          aria-label="Close navigation"
        />
      )}
    </div>
  );
}
