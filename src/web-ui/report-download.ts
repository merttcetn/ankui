import type { MultiProjectScanResult } from "../types.js";
import {
  buildSanitizedReportModel,
  renderSanitizedReportMarkdown
} from "../report/sanitized-report.js";

export interface ReportDownload {
  filename: string;
  mimeType: string;
  body: string;
}

export function createReportDownload(
  scan: MultiProjectScanResult,
  now: Date = new Date()
): ReportDownload {
  const model = buildSanitizedReportModel(scan, { generatedAt: now });
  return {
    filename: `ankui-report-${formatFileStamp(now)}.md`,
    mimeType: "text/markdown;charset=utf-8",
    body: renderSanitizedReportMarkdown(model)
  };
}

export function downloadReport(scan: MultiProjectScanResult): void {
  const report = createReportDownload(scan);
  const blob = new Blob([report.body], { type: report.mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function formatFileStamp(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}-${hh}${mm}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
