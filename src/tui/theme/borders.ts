/**
 * Box-drawing characters. Heavy is used for the outer Frame; light is used
 * for inner separators (section dividers, etc.).
 */
export const HEAVY = {
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  vertical: "┃"
} as const;

export const LIGHT = {
  horizontal: "─",
  vertical: "│",
  teeLeft: "┠",
  teeRight: "┨"
} as const;

/** Repeats a glyph N times. Pure helper. */
export function repeat(glyph: string, n: number): string {
  if (n <= 0) return "";
  return glyph.repeat(n);
}
