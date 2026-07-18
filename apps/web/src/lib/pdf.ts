import type { ReportSummary } from "@hiro/shared";

// Minimal, dependency-free PDF generator (PDF 1.4, single page, text only).
// Produces a real, openable .pdf so "automated reporting" includes a PDF
// export without pulling in a heavy third-party library.

interface Row {
  text: string;
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  gap?: number; // extra space before this row (pt)
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(rows: Row[]): Blob {
  const pageW = 612; // US Letter @72dpi
  const pageH = 792;
  const left = 54;
  let y = pageH - 60;

  const content: string[] = [];
  for (const r of rows) {
    const size = r.size ?? 11;
    const gap = r.gap ?? 6;
    y -= gap + size;
    if (y < 60) break;
    const [cr, cg, cb] = r.color ?? [0.1, 0.1, 0.12];
    const font = r.bold ? "F2" : "F1";
    content.push(
      `BT /${font} ${size} Tf ${cr} ${cg} ${cb} rg ${left} ${y.toFixed(
        1,
      )} Td (${esc(r.text)}) Tj ET`,
    );
  }

  const stream = content.join("\n");
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`;
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[6] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i <= 6; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    xref += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export a generated report as a downloadable PDF.
export function exportReportPdf(r: ReportSummary) {
  const m = r as any;
  const rows: Row[] = [
    { text: "Hiro Analytics", size: 22, bold: true, color: [0.43, 0.37, 0.99], gap: 0 },
    { text: r.title, size: 14, bold: true, gap: 12 },
    { text: `Period: ${r.periodStart} → ${r.periodEnd}`, size: 11, color: [0.4, 0.4, 0.45], gap: 4 },
    { text: "", gap: 8 },
    { text: "Performance", size: 13, bold: true, gap: 6 },
    { text: `Attributed revenue: $${Math.round(m.metrics?.revenue ?? 0).toLocaleString()}`, gap: 4 },
    { text: `Accurate revenue (filtered): $${Math.round(m.metrics?.filteredRevenue ?? 0).toLocaleString()}`, gap: 2 },
    { text: `Spend: $${Math.round(m.metrics?.spend ?? 0).toLocaleString()}`, gap: 2 },
    { text: `Sends: ${(m.metrics?.sends ?? 0).toLocaleString()}`, gap: 2 },
    { text: `Conversions: ${(m.metrics?.conversions ?? 0).toLocaleString()}`, gap: 2 },
    { text: `Open rate: ${(((m.metrics?.openRate ?? 0) * 100).toFixed(1))}%`, gap: 2 },
    { text: `Conversion rate: ${(((m.metrics?.conversionRate ?? 0) * 100).toFixed(1))}%`, gap: 2 },
    { text: `ROI: ${(((m.metrics?.roi ?? 0) * 100).toFixed(0))}%`, gap: 2 },
  ];

  if (r.summary) {
    rows.push({ text: "", gap: 10 });
    rows.push({ text: "Summary", size: 13, bold: true, gap: 6 });
    // Wrap summary roughly into lines.
    const words = r.summary.split(" ");
    let line = "";
    for (const w of words) {
      if ((line + " " + w).length > 95) {
        rows.push({ text: line, gap: 3 });
        line = w;
      } else {
        line = line ? line + " " + w : w;
      }
    }
    if (line) rows.push({ text: line, gap: 3 });
  }

  if (r.followUps?.length) {
    rows.push({ text: "", gap: 10 });
    rows.push({ text: "Suggested follow-ups", size: 13, bold: true, gap: 6 });
    r.followUps.forEach((f: string, i: number) => {
      const words = f.split(" ");
      let line = `${i + 1}. `;
      for (const w of words) {
        if ((line + " " + w).length > 95) {
          rows.push({ text: line, gap: 3 });
          line = "    " + w;
        } else {
          line = line ? line + " " + w : w;
        }
      }
      rows.push({ text: line, gap: 3 });
    });
  }

  download(`${r.title.replace(/\s+/g, "_")}.pdf`, buildPdf(rows));
}
