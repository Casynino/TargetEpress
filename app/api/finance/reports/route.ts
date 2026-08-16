import { NextResponse } from "next/server";

import { currentRateValue } from "@/lib/fx";
import { windowFor } from "@/lib/profit";
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

  /*
    The same stretch of time the screen was showing.

    The chip at the top of the page writes `period=month` into the URL and the
    download link carried it faithfully — but nothing here ever read it, so a
    PDF opened from "This month" was quietly run over ALL TIME. Two people then
    read different revenue off "the same report" and neither could see why.
    Resolved through the identical helper the page uses, so the two cannot
    drift apart again. Typed From/To still wins: that is somebody being
    explicit.
  */
  const typedFrom = date(params.get("from"));
  const typedTo = date(params.get("to"));
  const typedRange = typedFrom !== null || typedTo !== null;
  const picked = windowFor(
    typedRange ? "custom" : (params.get("period") ?? "month"),
    "en",
    { from: typedFrom, to: null }
  );
  // Inclusive of the closing day: a person choosing 31 August means the whole
  // of it, and the filters compare with `lt`.
  const toExclusive = (() => {
    if (!typedTo) return null;
    const end = new Date(typedTo);
    end.setDate(end.getDate() + 1);
    return end;
  })();

  const [raw, rate] = await Promise.all([
    runReport(key, {
      from: typedRange ? typedFrom : picked.window.from,
      to: typedRange ? toExclusive : picked.window.to,
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
  const period = typedRange
    ? `${params.get("from") ?? "the beginning"} to ${params.get("to") ?? "today"}`
    : picked.window.label;

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
