import React, { type CSSProperties } from "react";

// Product-local adaptation of Dot Matrix's "Core Spiral" loader.
// Source: https://dotmatrix.zzzzshawn.cloud/r/dotm-square-3.json
const SPIRAL_PATH = [
  0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 21, 20,
  15, 10, 5, 6, 7, 8, 13, 18, 17, 16, 11, 12
] as const;

const ORDER_BY_INDEX = SPIRAL_PATH.reduce<number[]>((order, index, pathIndex) => {
  order[index] = pathIndex;
  return order;
}, []);

export function DotMatrixCoreSpiral(props: {
  size?: number;
  dotSize?: number;
  ariaLabel?: string;
  decorative?: boolean;
  className?: string;
}): React.ReactElement {
  const style = {
    "--dmx-size": `${props.size ?? 72}px`,
    "--dmx-dot-size": `${props.dotSize ?? 7}px`,
    "--dmx-dots-width": `${(props.dotSize ?? 7) * 5}px`
  } as CSSProperties;

  return (
    <span
      className={`dmx-core-spiral${props.className ? ` ${props.className}` : ""}`}
      style={style}
      role={props.decorative ? undefined : "status"}
      aria-label={props.decorative ? undefined : props.ariaLabel ?? "Scanning local agent files"}
      aria-hidden={props.decorative ? true : undefined}
    >
      {ORDER_BY_INDEX.map((order, index) => (
        <i
          key={index}
          className="dmx-core-spiral-dot"
          style={{ "--dmx-order": order } as CSSProperties}
          aria-hidden
        />
      ))}
    </span>
  );
}
