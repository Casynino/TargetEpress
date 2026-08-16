import { NextResponse } from "next/server";

import { currentRateValue } from "@/lib/fx";
import { can } from "@/lib/rbac";
import { reportToPdf } from "@/lib/report-pdf";
import {
  REPORTS,
  presentReport,
  reportToCsv,
  runReport,
  type ReportKey,
} from "@/lib/reports";
import { currentUser } from "@/lib/session";

/**
 * A report as a spreadsheet.
 *
 * Same engine and same filters as the screen, so what downloads is exactly
 * what was on the page — a download that quietly ignores the date filter is
 * how two people end up arguing about a figure they both read off "the same"
 * report.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "report.view")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const key = (params.get("report") ?? "profit-loss") as ReportKey;
  if (!REPORTS.some((r) => r.key === key)) {
    return NextResponse.json({ error: "No such report" }, { status: 404 });
  }

  const date = (value: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /*
    `unit`, not `currency`.

    ReportFilters.currency already means something else here — it filters the
    ledger down to entries recorded in one currency — so naming the display
    choice `currency` would have silently thrown away most of the register
    every time somebody asked for shillings.
  */
  const unit = params.get("unit") === "tzs" ? "TZS" : "USD";

  const [raw, rate] = await Promise.all([
    runReport(key, {
    from: date(params.get("from")),
    // Inclusive of the closing day: a person choosing 31 August means the
    // whole of it, and the filters compare with `lt`.
    to: (() => {
      const to = date(params.get("to"));
      if (!to) return null;
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      return end;
    })(),
      batchId: params.get("batch"),
      accountId: params.get("account"),
      category: params.get("category"),
      currency: params.get("currency"),
    }),
    currentRateValue(),
  ]);

  /* Restated into the currency the reader is working in — one currency per
     document, never two columns of the same money. */
  const report = presentReport(raw, { unit, rate });

  const stamp = new Date().toISOString().slice(0, 10);
  const period =
    params.get("from") || params.get("to")
      ? `${params.get("from") ?? "the beginning"} to ${params.get("to") ?? "today"}`
      : "All time";

  /*
    Two formats, one set of figures.

    The spreadsheet is for working with the numbers; the PDF is for handing
    them to somebody — the boss, the bank, an auditor. Both are rendered from
    the same ReportResult that the page itself displays, so a printed statement
    cannot disagree with the screen it was printed from.
  */
  if (params.get("format") === "pdf") {
    const pdf = reportToPdf(report, {
      period,
      currencyNote: report.currencyNote,
      unitLabel: report.unitLabel,
      filters: params.get("batch") ? "One batch" : undefined,
      preparedBy: user.name,
    });
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        // Inline: a PDF is read, not filed. Forcing the download left the tab
        // blank, which reads as a broken link rather than a saved file.
        "content-disposition": `inline; filename="target-express-${key}-${stamp}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }

  return new NextResponse(reportToCsv(report), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="target-express-${key}-${stamp}.csv"`,
      // A report is a snapshot of a moving thing; a cached one is a wrong one.
      "cache-control": "no-store",
    },
  });
}
