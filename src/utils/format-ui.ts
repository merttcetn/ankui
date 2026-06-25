export interface FormatOptions {
  color?: boolean;
}

type StyleName = "bold" | "dim" | "cyan" | "green" | "yellow" | "red" | "gray";

const ANSI: Record<StyleName, readonly [open: string, close: string]> = {
  bold: ["\u001b[1m", "\u001b[22m"],
  dim: ["\u001b[2m", "\u001b[22m"],
  cyan: ["\u001b[36m", "\u001b[39m"],
  green: ["\u001b[32m", "\u001b[39m"],
  yellow: ["\u001b[33m", "\u001b[39m"],
  red: ["\u001b[31m", "\u001b[39m"],
  gray: ["\u001b[90m", "\u001b[39m"]
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function style(text: string, options: FormatOptions | undefined, ...styles: StyleName[]): string {
  if (!options?.color || styles.length === 0 || text.length === 0) return text;

  let output = text;
  for (const styleName of styles) {
    const [open, close] = ANSI[styleName];
    output = `${open}${output}${close}`;
  }
  return output;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function padEndVisible(text: string, width: number): string {
  const padding = Math.max(0, width - visibleLength(text));
  return `${text}${" ".repeat(padding)}`;
}

export function metricRow(label: string, value: string, options?: FormatOptions): string {
  return `${style(padEndVisible(label, 13), options, "dim")} ${value}`;
}

export function sectionTitle(title: string, options?: FormatOptions): string {
  return style(title, options, "bold", "cyan");
}

export function sectionUnderline(title: string, options?: FormatOptions): string {
  return style("─".repeat(visibleLength(title)), options, "gray");
}

export function statusIcon(kind: "ok" | "muted" | "warn" | "danger", options?: FormatOptions): string {
  if (kind === "ok") return style("✓", options, "green");
  if (kind === "warn") return style("!", options, "yellow");
  if (kind === "danger") return style("!", options, "red");
  return style("○", options, "gray");
}

export function tableHeader(columns: readonly string[], widths: readonly number[], options?: FormatOptions): string {
  return columns
    .map((column, index) => {
      const text = index === columns.length - 1 ? column : padEndVisible(column, widths[index] ?? column.length);
      return style(text, options, "dim");
    })
    .join("  ");
}

export function tableRow(values: readonly string[], widths: readonly number[]): string {
  return values
    .map((value, index) => index === values.length - 1 ? value : padEndVisible(value, widths[index] ?? visibleLength(value)))
    .join("  ");
}
