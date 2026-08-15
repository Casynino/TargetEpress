import "server-only";

import { jsPDF } from "jspdf";

import { COMPANY } from "@/lib/constants";
import type { ReportResult } from "@/lib/reports";

/**
 * A financial report as a document somebody can hand over.
 *
 * The spreadsheet answers "let me work with these numbers"; this answers "put
 * it in front of the boss, the bank or the auditor". Same ReportResult, so
 * there is no second set of figures — only a second way of printing the one
 * the page is already showing.
 *
 * Deliberately plain. A financial statement earns trust by being legible and
 * consistent, not by being decorated: the company at the top, the report and
 * the period it covers, the columns as they appear on screen, totals ruled off,
 * and the date it was produced at the foot so two printings can be told apart.
 *
 * Built on jsPDF, already in the project for cargo labels — no new dependency
 * for a document nobody scans.
 */
export function reportToPdf(report: ReportResult, meta: { period?: string }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = pageWidth - 40;
  let y = 56;

  // ------------------------------------------------------------------ header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(COMPANY.name, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  y += 14;
  doc.text(COMPANY.taglineEn ?? "Air cargo, China to Tanzania", left, y);

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  y += 30;
  doc.text(report.title, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  if (meta.period) {
    y += 13;
    doc.text(meta.period, left, y);
  }
  if (report.caption) {
    y += 12;
    doc.text(doc.splitTextToSize(report.caption, right - left), left, y);
    y += 4;
  }

  // ------------------------------------------------------------------- table
  y += 22;
  const columns = report.columns;
  /* Numeric columns are right-aligned and given a fixed share, so a column of
     figures lines up on its digits the way a ledger does. */
  const numeric = columns.map((c) => Boolean(c.numeric));
  const widths: number[] = columns.map((c) => (c.numeric ? 78 : 0));
  const flexible = widths.filter((w) => w === 0).length;
  const spare = right - left - widths.reduce((a, b) => a + b, 0);
  const colWidth = columns.map((_, i) =>
    widths[i] === 0 ? Math.max(60, spare / Math.max(1, flexible)) : widths[i]
  );
  const xAt = (i: number) =>
    left + colWidth.slice(0, i).reduce((a, b) => a + b, 0);

  const headerRow = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(90);
    columns.forEach((col, i) => {
      const x = numeric[i] ? xAt(i) + colWidth[i] - 2 : xAt(i);
      doc.text(String(col.label).toUpperCase(), x, y, {
        align: numeric[i] ? "right" : "left",
      });
    });
    y += 6;
    doc.setDrawColor(200);
    doc.line(left, y, right, y);
    y += 12;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  headerRow();

  for (const row of report.rows) {
    if (y > pageHeight - 70) {
      doc.addPage();
      y = 56;
      headerRow();
    }
    columns.forEach((col, i) => {
      const raw = row[col.key];
      const value =
        raw === null || raw === undefined
          ? "—"
          : typeof raw === "number"
            ? raw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : String(raw);
      const x = numeric[i] ? xAt(i) + colWidth[i] - 2 : xAt(i);
      doc.text(doc.splitTextToSize(value, colWidth[i] - 6)[0] ?? "", x, y, {
        align: numeric[i] ? "right" : "left",
      });
    });
    y += 15;
  }

  // ------------------------------------------------------------------ totals
  if (report.totals) {
    y += 2;
    doc.setDrawColor(120);
    doc.line(left, y, right, y);
    y += 14;
    doc.setFont("helvetica", "bold");
    columns.forEach((col, i) => {
      const raw = report.totals?.[col.key];
      if (raw === null || raw === undefined) return;
      const value =
        typeof raw === "number"
          ? raw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(raw);
      const x = numeric[i] ? xAt(i) + colWidth[i] - 2 : xAt(i);
      doc.text(value, x, y, { align: numeric[i] ? "right" : "left" });
    });
  }

  // ------------------------------------------------------------------ footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    `Produced ${new Date().toISOString().slice(0, 16).replace("T", " ")} · derived from the operational record — there is no separate set of books.`,
    left,
    pageHeight - 32
  );

  return Buffer.from(doc.output("arraybuffer"));
}
