import type { ReportSummary } from "@hiro/shared";

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export a generated report as a flat CSV a client can drop into Sheets.
export function exportReportCsv(r: ReportSummary) {
  const m = r as any;
  const rows: (string | number)[][] = [
    ["Hiro Analytics Report", r.title],
    ["Period", `${r.periodStart} to ${r.periodEnd}`],
    [],
    ["Metric", "Value"],
    ["Attributed Revenue", m.metrics?.revenue ?? 0],
    ["Accurate Revenue", m.metrics?.filteredRevenue ?? 0],
    ["Spend", m.metrics?.spend ?? 0],
    ["Sends", m.metrics?.sends ?? 0],
    ["Opens", m.metrics?.opens ?? 0],
    ["Clicks", m.metrics?.clicks ?? 0],
    ["Conversions", m.metrics?.conversions ?? 0],
    ["Open Rate", `${((m.metrics?.openRate ?? 0) * 100).toFixed(1)}%`],
    ["Conversion Rate", `${((m.metrics?.conversionRate ?? 0) * 100).toFixed(1)}%`],
    ["ROI", `${((m.metrics?.roi ?? 0) * 100).toFixed(0)}%`],
    [],
    ["Summary", r.summary ?? ""],
    [],
    ["Suggested Follow-ups"],
    ...(r.followUps ?? []).map((f: string, i: number) => [`${i + 1}`, f]),
  ];
  download(`${r.title.replace(/\s+/g, "_")}.csv`, toCsv(rows));
}
