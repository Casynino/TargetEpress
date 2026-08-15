import { format } from "date-fns";
import { NextResponse } from "next/server";

import { financeDashboard } from "@/lib/finance-dashboard";
import { currentRateValue } from "@/lib/fx";
import { profitAndLoss, type ProfitWindow } from "@/lib/profit";
import { can } from "@/lib/rbac";
import { statementToPdf } from "@/lib/statement-pdf";
import { currentUser } from "@/lib/session";

/**
 * The financial statement for one period, as a PDF.
 *
 * Separate from /api/finance/reports, which hands over one table. This hands
 * over the whole set of books — profit and loss, cash, revenue, expenses,
 * batch by batch, position, collections, volume — for a month, a year, or a
 * stretch of dates somebody typed. It is the document that gets printed and
 * put in front of the boss or a bank, so the period it covers is chosen
 * deliberately rather than inherited from whatever the screen happened to
 * show.
 *
 * Rendered INLINE. A statement is something you read; a browser that silently
 * files it in Downloads and shows a blank tab looks broken, and the reader's
 * own save button is right there.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "profit.view")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const now = new Date();

  /* One day before a window's end — the last day actually inside it. The
     windows are half-open (`lt`), so the printed dates must step back one day
     or a statement for August would claim to cover 1 September. */
  const lastDay = (to: Date) => new Date(to.getTime() - 86_400_000);

  const span = (from: Date, to: Date, label: string): ProfitWindow => ({ from, to, label });

  const built = (() => {
    /*
      One control on screen, two shapes of answer.

      The picker is a single dropdown holding both months and years, so it
      sends one `period` — "2026-08" or "2026". The explicit `month=` and
      `year=` parameters still work for anything linking straight here.
    */
    const chosen = params.get("period") ?? "";
    const month = params.get("month") ?? (/^\d{4}-\d{2}$/.test(chosen) ? chosen : null);
    const year = params.get("year") ?? (/^\d{4}$/.test(chosen) ? chosen : null);

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 1);
      const prevFrom = new Date(y, m - 2, 1);
      return {
        window: span(from, to, format(from, "MMMM yyyy")),
        previous: span(prevFrom, from, format(prevFrom, "MMMM yyyy")),
        dates: `${format(from, "d MMMM")} – ${format(lastDay(to), "d MMMM yyyy")}`,
      };
    }

    if (year && /^\d{4}$/.test(year)) {
      const y = Number(year);
      const from = new Date(y, 0, 1);
      const to = new Date(y + 1, 0, 1);
      return {
        window: span(from, to, String(y)),
        previous: span(new Date(y - 1, 0, 1), from, String(y - 1)),
        dates: `1 January – 31 December ${y}`,
      };
    }

    const parse = (value: string | null) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const from = parse(params.get("from"));
    const typedTo = parse(params.get("to"));
    if (from) {
      /* Inclusive of the closing day: somebody choosing 31 August means the
         whole of it, and every query underneath compares with `lt`. */
      const to = typedTo
        ? new Date(typedTo.getTime() + 86_400_000)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const width = Math.max(86_400_000, to.getTime() - from.getTime());
      return {
        window: span(from, to, `${format(from, "d MMM yyyy")} – ${format(lastDay(to), "d MMM yyyy")}`),
        previous: span(new Date(from.getTime() - width), from, "the stretch before"),
        dates: `${format(from, "d MMMM yyyy")} – ${format(lastDay(to), "d MMMM yyyy")}`,
      };
    }

    /* Nothing chosen: this calendar month, which is what the finance screen
       opens on. */
    const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
    const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevDefault = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      window: span(fromDefault, toDefault, format(fromDefault, "MMMM yyyy")),
      previous: span(prevDefault, fromDefault, format(prevDefault, "MMMM yyyy")),
      dates: `${format(fromDefault, "d MMMM")} – ${format(lastDay(toDefault), "d MMMM yyyy")}`,
    };
  })();

  const [pl, prior, dash, rate] = await Promise.all([
    profitAndLoss(built.window),
    profitAndLoss(built.previous),
    financeDashboard(built.window, built.previous, {
      batchId: params.get("batch"),
      origin: params.get("origin"),
    }),
    currentRateValue(),
  ]);

  const pdf = statementToPdf({
    dash,
    pl,
    prior,
    rate,
    periodLabel: built.window.label,
    periodDates: built.dates,
    previousLabel: built.previous.label,
    producedBy: user.name ?? "Finance",
  });

  const slug = built.window.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="target-express-statement-${slug}.pdf"`,
      // A statement is a snapshot of a moving thing; a cached one is a wrong one.
      "cache-control": "no-store",
    },
  });
}
