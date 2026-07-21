import React, { useEffect, useMemo, useState } from "react";

export interface EntityRailItem {
  id: string;
  label: React.ReactNode;
  searchText?: string;
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
  searchable?: boolean;
  segmented?: boolean;
  searchPlaceholder?: string;
}

export function EntityRail({
  sections,
  selectedId,
  onSelect,
  searchable,
  segmented = false,
  searchPlaceholder = "Filter…"
}: EntityRailProps): React.ReactElement {
  const selectedSection = sections.find((section) =>
    section.items.some((item) => item.id === selectedId)
  );
  const [activeSection, setActiveSection] = useState(
    selectedSection?.heading ?? sections[0]?.heading ?? ""
  );
  const [query, setQuery] = useState("");
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const showSearch = searchable ?? totalItems > 7;

  useEffect(() => {
    if (selectedSection && selectedSection.heading !== activeSection) {
      setActiveSection(selectedSection.heading);
    }
  }, [activeSection, selectedSection]);

  const visibleSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return sections
      .filter((section) => !segmented || section.heading === activeSection)
      .map((section) => ({
        ...section,
        items: normalized
          ? section.items.filter((item) =>
              searchableText(item).includes(normalized)
            )
          : section.items
      }))
      .filter((section) => section.items.length > 0);
  }, [activeSection, query, sections, segmented]);

  return (
    <div className="ank-rail-inner">
      {segmented && sections.length > 1 && (
        <div className="ank-rail-segments" aria-label="Browse by type">
          {sections.map((section) => (
            <button
              type="button"
              key={section.heading}
              className={section.heading === activeSection ? "is-active" : ""}
              onClick={() => {
                setActiveSection(section.heading);
                setQuery("");
              }}
              aria-pressed={section.heading === activeSection}
            >
              {section.heading}<span>{section.items.length}</span>
            </button>
          ))}
        </div>
      )}
      {showSearch && (
        <label className="ank-rail-search">
          <span className="sr-only">Filter items</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
          />
        </label>
      )}
      {visibleSections.map((section, sIdx) => (
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
              aria-current={item.id === selectedId ? "true" : undefined}
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
      {visibleSections.length === 0 && (
        <div className="ank-rail-empty">No matching items.</div>
      )}
    </div>
  );
}

function searchableText(item: EntityRailItem): string {
  if (item.searchText) return item.searchText.toLocaleLowerCase();
  if (typeof item.label === "string" || typeof item.label === "number") {
    return `${item.label}`.toLocaleLowerCase();
  }
  return "";
}
