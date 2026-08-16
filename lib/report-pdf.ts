import "server-only";

import { MUTED, createSheet } from "@/lib/pdf-kit";
import type { ReportResult } from "@/lib/reports";

/**
 * A report as a document somebody can hand over.
 *
 * The first version of this was a title and a grid of numbers on white paper,
 * and the owner's verdict was exactly right: it looked like someone had
 * written on a sheet rather than issued a report. Nothing about the figures
 * was wrong — it simply had none of the furniture that makes a document read
 * as one, while the invoice sitting beside it in the same system had all of
 * it.
 *
 * So it comes off the same press as the invoice now: brand rule, logo, ghosted
 * watermark, a strip stating the period and the money it is written in, a
 * navy-banded table with zebra rows and red negatives, a ruled total, and a
 * footer that attributes every page. Wide reports turn the page on their side
 * rather than crushing twelve columns into A4 portrait.
 *
 * One currency, chosen by the reader — see presentReport in lib/reports.ts.
 */
export function reportToPdf(
  report: ReportResult,
  meta: {
    period?: string;
    /** "Money shown in shillings, converted at…" — printed under the table. */
    currencyNote?: string;
    unitLabel?: string;
    filters?: string;
    preparedBy?: string;
  }
) {
  /*
    Portrait for a reading report, landscape for a register.

    Seven columns is about where A4 portrait stops being a table and starts
    being a list of abbreviations; the ledger and the expense report carry ten
    or twelve. Turning the page is what a printed register has always done.
  */
  const landscape = report.columns.length > 7;

  const sheet = createSheet({
    kind: "Report",
    title: report.title,
    subtitle: meta.period,
    caption: report.caption,
    reference: report.title,
    landscape,
    facts: [
      { label: "Period", value: meta.period ?? "All time" },
      {
        label: "Money in",
        value: !report.columns.some((c) => c.money)
          ? /* The ledger family holds each account's own currency and converts
               nothing, so claiming a unit here would be a plain untruth. */
            "As recorded"
          : meta.unitLabel === "TSh"
            ? "Shillings"
            : "Dollars",
      },
      { label: "Rows", value: String(report.rows.length) },
      ...(meta.filters ? [{ label: "Filtered by", value: meta.filters }] : []),
    ],
  });

  sheet.heading();

  if (report.rows.length === 0) {
    /* An empty report says so in words. A header band with nothing under it
       reads as a document that failed to render. */
    sheet.put(
      "Nothing matched these filters for this period.",
      sheet.geometry.MARGIN,
      sheet.y + 8,
      { size: 10, style: "bold" }
    );
    sheet.y += 26;
    sheet.put(
      "The report ran; there is no activity on record inside the window chosen above.",
      sheet.geometry.MARGIN,
      sheet.y,
      { size: 8.5, colour: MUTED }
    );
    sheet.y += 24;
  } else {
    sheet.table({
      columns: report.columns.map((c) => ({
        key: c.key,
        label: c.label,
        numeric: c.numeric,
        /* The first columns are what somebody scans down — an invoice number,
           a date, a customer — so they are never squeezed to fit figures. */
        min: c.numeric ? 46 : 64,
      })),
      rows: report.rows.map((row) => report.columns.map((c) => row[c.key] ?? null)),
      totals: report.totals
        ? report.columns.map((c, i) =>
            i === 0 ? "Total" : (report.totals?.[c.key] ?? null)
          )
        : undefined,
      note: meta.currencyNote,
    });
  }

  sheet.signature(meta.preparedBy ?? "Finance");
  return sheet.finish();
}
