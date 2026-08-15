import { NextResponse } from "next/server";

import { can } from "@/lib/rbac";
import { reportToPdf } from "@/lib/report-pdf";
import { REPORTS, reportToCsv, runReport, type ReportKey } from "@/lib/reports";
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

  const report = await runReport(key, {
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
  });

  const stamp = new Date().toISOString().slice(0, 10);

  /*
    Two formats, one set of figures.

    The spreadsheet is for working with the numbers; the PDF is for handing
    them to somebody — the boss, the bank, an auditor. Both are rendered from
    the same ReportResult that the page itself displays, so a printed statement
    cannot disagree with the screen it was printed from.
  */
  if (params.get("format") === "pdf") {
    const pdf = reportToPdf(report, {
      period:
        params.get("from") || params.get("to")
          ? `${params.get("from") ?? "the beginning"} to ${params.get("to") ?? "today"}`
          : undefined,
    });
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="target-express-${key}-${stamp}.pdf"`,
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
