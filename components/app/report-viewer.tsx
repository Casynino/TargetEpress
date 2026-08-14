import Link from "next/link";
import { Download } from "lucide-react";

import { t } from "@/lib/i18n";
import { REPORTS, type ReportResult } from "@/lib/reports";
import { viewerLocale } from "@/lib/viewer";

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
  filters,
}: {
  report: ReportResult;
  /** The current filters as a query string, so links and the download agree. */
  query: string;
  /** Rendered above the table — dates, flight, account, category. */
  filters?: React.ReactNode;
}) {
  const locale = await viewerLocale();
  const q = query ? `&${query}` : "";

  return (
    <section className="panel overflow-hidden">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {REPORTS.map((r) => (
            <Link
              key={r.key}
              href={`/app/finance/reports?report=${r.key}${q}`}
              aria-current={report.key === r.key ? "true" : undefined}
              className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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
        </div>
        <a
          href={`/api/finance/reports?report=${report.key}${q}`}
          className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          {t(locale, "Download")}
        </a>
      </div>

      {report.rows.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">
          {t(locale, "Nothing to report for these filters.")}
        </p>
      ) : (
        <div className="overflow-x-auto">
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
                        {value === null || value === undefined || value === ""
                          ? "—"
                          : typeof value === "number"
                            ? value.toLocaleString("en-US", {
                                minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
                                maximumFractionDigits: 2,
                              })
                            : value}
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
                      {i === 0
                        ? t(locale, "Total")
                        : report.totals?.[c.key] !== undefined
                          ? report.totals[c.key].toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </section>
  );
}
