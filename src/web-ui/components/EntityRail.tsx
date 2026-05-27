import React from "react";

export interface EntityRailItem {
  id: string;
  label: React.ReactNode;
  count?: number;
  /** Optional dot color: "ok" (green), "warn" (yellow), or undefined (none). */
  pip?: "ok" | "warn";
}

export interface EntityRailSection {
  heading: string;
  items: EntityRailItem[];
}

export interface EntityRailProps {
  sections: EntityRailSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EntityRail({ sections, selectedId, onSelect }: EntityRailProps): React.ReactElement {
  return (
    <>
      {sections.map((section, sIdx) => (
        <div key={section.heading} className="ank-rail-section">
          <div className={`ank-rail-heading${sIdx > 0 ? " ank-rail-heading-spaced" : ""}`}>
            {section.heading}
          </div>
          {section.items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ank-rail-row${item.id === selectedId ? " is-active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="ank-rail-row-label">
                {item.pip && <span className={`ank-rail-pip ank-rail-pip-${item.pip}`} />}
                {item.label}
              </span>
              {item.count !== undefined && (
                <span className="ank-rail-row-count">{item.count}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
