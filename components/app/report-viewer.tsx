import Link from "next/link";
import { Download, FileText } from "lucide-react";

import { t } from "@/lib/i18n";
import { REPORTS, type ReportResult } from "@/lib/reports";
import { viewerLocale } from "@/lib/viewer";

/**
 * A cell, as text.
 *
 * Pulled out when the phone cards arrived: the table and the cards were each
 * deciding how many decimals a figure gets, which is how the same number ends
 * up reading "5,407,506" on a laptop and "5407506" on a handset.
 */
function cellText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  return value as React.ReactNode;
}

/**
 * Any report, on one screen.
 *
 * Fourteen reports do not need fourteen pages. They need one picker, one set
 * of filters, one table and one download — which is also the only way the
 * download is guaranteed to match what is on screen, because both come from
 * the same call.
 */
export async function ReportViewer({
  report,
  query,
  linkQuery,
  filters,
  note,
}: {
  report: ReportResult;
  /**
   * The filters as the DOWNLOAD needs them — including `unit`, which restates
   * money in the reader's currency.
   */
  query: string;
  /**
   * The filters as a LINK back into this page needs them — including
   * `currency`, the screen's own switch.
   *
   * Two strings rather than one, because the two consumers disagree on a name:
   * the report engine already has a `currency` filter that narrows the ledger
   * to entries recorded in one currency, so handing `currency=usd` to the API
   * would silently drop most of the register. Sharing one query string meant
   * either the pills lost the currency or the download filtered the ledger to
   * nothing.
   */
  linkQuery?: string;
  /** Rendered above the table — dates, flight, account, category. */
  filters?: React.ReactNode;
  /** Which money the figures are in, and at what rate. */
  note?: string;
}) {
  const locale = await viewerLocale();
  const q = query ? `&${query}` : "";
  const linkQ = (linkQuery ?? query) ? `&${linkQuery ?? query}` : "";

  return (
    /*
      Anchored, and every link into it keeps the anchor.

      Picking a report is a navigation, so the browser was landing the reader
      back at the top of a very long page and making them scroll down again to
      see what they had just chosen. The section names itself and the links
      point at that name, so the page comes back where the reader was working.
    */
    <section id="reports" className="panel scroll-mt-4 overflow-hidden">
      <div className="border-b px-5 py-4">
        {/* Fourteen pills at 26px tall and 6px apart is a picker you tap the
            wrong report on. They keep their desk size and grow to a thumb's
            worth below sm. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-1.5">
          {REPORTS.map((r) => (
            <Link
              key={r.key}
              href={`/app/finance/reports?report=${r.key}${linkQ}#reports`}
              aria-current={report.key === r.key ? "true" : undefined}
              className={`focus-ring inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-0 sm:py-1 ${
                report.key === r.key
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t(locale, r.label)}
            </Link>
          ))}
        </div>
      </div>

      {filters ? <div className="border-b bg-muted/30 px-5 py-3">{filters}</div> : null}

      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display font-semibold">{t(locale, report.title)}</h2>
          {/* What the reader is looking at, and what it leaves out. A report
              whose exclusions are not stated will be misread eventually. */}
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            {t(locale, report.caption)}
          </p>
          {note ? (
            <p className="mt-1 max-w-3xl text-[11px] text-muted-foreground">{note}</p>
          ) : null}
        </div>
        {/*
          Two formats, because they are two different jobs: a spreadsheet to
          work the numbers in, and a PDF to put in front of the boss, the bank
          or an auditor. Both render the same figures this table is showing.
        */}
        {/* Both open in their own tab: a document is something you look at
            beside the page, not instead of it. */}
        <span className="inline-flex shrink-0 overflow-hidden rounded-md border">
          <a
            href={`/api/finance/reports?report=${report.key}${q}`}
            target="_blank"
            rel="noopener"
            className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 border-r px-3 text-xs font-medium hover:bg-accent sm:min-h-0 sm:py-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {t(locale, "Spreadsheet")}
          </a>
          {/*
            `&`, never `?`.

            This built its own separator — `?` when there were no filters — and
            produced /api/finance/reports?report=profit-loss?format=pdf. The
            query string already began at `?report=`, so the second one made
            "profit-loss?format=pdf" the report name, and every filter-free PDF
            click answered {"error":"No such report"}. The separator was never
            in question: there is always a parameter in front of this one.
          */}
          <a
            href={`/api/finance/reports?report=${report.key}${q}&format=pdf`}
            target="_blank"
            rel="noopener"
            className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 px-3 text-xs font-medium hover:bg-accent sm:min-h-0 sm:py-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            {t(locale, "PDF")}
          </a>
        </span>
      </div>

      {report.rows.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">
          {t(locale, "Nothing to report for these filters.")}
        </p>
      ) : (
        <>
        {/*
          A report is as wide as it has columns — the ledger ones reach eleven.
          Below md each row becomes a card: the first column is the heading
          somebody scans for, everything else is labelled underneath, and the
          totals row becomes a panel at the foot rather than a `tfoot` that has
          scrolled out of sight.
        */}
        <ul className="divide-y border-y md:hidden">
          {report.rows.map((row, i) => (
            <li key={i} className="px-4 py-3">
              <p className="font-medium">{cellText(row[report.columns[0].key])}</p>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {report.columns.slice(1).map((c) => {
                  const value = row[c.key];
                  return (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">
                        {t(locale, c.label)}
                      </dt>
                      <dd
                        className={`truncate ${c.numeric ? "tabular-nums" : ""} ${
                          c.numeric && typeof value === "number" && value < 0
                            ? "text-destructive"
                            : ""
                        }`}
                      >
                        {cellText(value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
          {report.totals ? (
            <li className="bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(locale, "Total")}
              </p>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-medium">
                {report.columns
                  .slice(1)
                  .filter((c) => report.totals?.[c.key] !== undefined)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs font-normal text-muted-foreground">
                        {t(locale, c.label)}
                      </dt>
                      <dd className="truncate tabular-nums">
                        {cellText(report.totals?.[c.key])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </li>
          ) : null}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {report.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2 font-medium ${c.numeric ? "text-right" : ""}`}
                  >
                    {t(locale, c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {report.columns.map((c) => {
                    const value = row[c.key];
                    return (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${
                          c.numeric ? "text-right tabular-nums" : ""
                        } ${
                          // A negative figure is the one a reader must not skim past.
                          c.numeric && typeof value === "number" && value < 0
                            ? "text-destructive"
                            : ""
                        }`}
                      >
                        {cellText(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {report.totals ? (
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-medium">
                  {report.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 ${c.numeric ? "text-right tabular-nums" : ""}`}
                    >
                      {/* Shillings have no cents: a converted total was
                          printing "5,407,506.00", two digits of noise on a
                          figure nobody quotes that way. `cellText` decides by
                          value, the same way the rows above do. */}
                      {i === 0
                        ? t(locale, "Total")
                        : report.totals?.[c.key] !== undefined
                          ? cellText(report.totals[c.key])
                          : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        </>
      )}
    </section>
  );
}
