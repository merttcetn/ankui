import React from "react";

export interface StatGridItem {
  label: string;
  value: number | string;
}

export interface StatGridProps {
  items: StatGridItem[];
}

export function StatGrid({ items }: StatGridProps): React.ReactElement {
  return (
    <div className="ank-stats" style={{ "--stat-count": items.length } as React.CSSProperties}>
      {items.map((item) => (
        <div className="ank-stat" key={item.label}>
          <div className="ank-stat-n">{item.value}</div>
          <div className="ank-stat-l">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
