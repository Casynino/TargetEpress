import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plane } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BATCH_STATUS_META, ORIGIN_LABELS } from "@/lib/constants";
import { financeDashboard } from "@/lib/finance-dashboard";
import { formatDate, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatLocal, formatUsd } from "@/lib/money";
import { windowFor } from "@/lib/profit";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Batch finances") };
}

/**
 * WHAT EACH FLIGHT MADE — FOR THE DESK THAT RECORDED IT.
 *
 * The manager has had this list since the control desk was built. Finance,
 * which enters every figure on it, had no door to it at all: they could see a
 * payment, a cost and an invoice one at a time and never the aircraft they
 * belong to. The owner asked for it here too, and the permission was already
 * held — only the page was missing.
 *
 * Deliberately NOT a copy of the manager's page. That one carries the verdict
 * machinery: sending a batch back, flagging it, agreeing it. Ruling on figures
 * is the manager's job and Finance recording them is not the same job, so this
 * is the list and the way into one flight's book, and nothing else.
 *
 * THE FIGURES ARE financeDashboard's, the same engine both other screens read.
 */
export default async function FinanceBatchesPage() {
  const user = await requirePermission("profit.view");
  const locale = await viewerLocale();
  const picked = windowFor("all");
  const [dash, rateRow] = await Promise.all([
    financeDashboard(picked.window, picked.previous),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const show = (local: number, usd: number) =>
    rate === null ? formatUsd(usd) : formatLocal(local);

  return (
    <>
      <FinanceWorkspaceHeader
        role={user.role}
        title={t(locale, "Batch finances")}
        description={t(
          locale,
          "What every flight earned and what it cost. Open one to read its whole book — every payment, every cost, and everything still owed on it."
        )}
      />

      <SectionLabel>{t(locale, "Every flight, worst margin first")}</SectionLabel>

      {dash.batches.length === 0 ? (
        <EmptyState
          title={t(locale, "No flights to show yet")}
          description={t(locale, "A flight appears here once it carries cargo that has been priced.")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Batch")}</TableHead>
                <TableHead className="text-right">{t(locale, "Revenue")}</TableHead>
                <TableHead className="text-right">{t(locale, "Collected")}</TableHead>
                <TableHead className="text-right">{t(locale, "Outstanding")}</TableHead>
                <TableHead className="text-right">{t(locale, "Costs")}</TableHead>
                <TableHead className="text-right">{t(locale, "Profit / loss")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dash.batches.map((b) => {
                const meta = BATCH_STATUS_META[b.status as keyof typeof BATCH_STATUS_META];
                return (
                  <TableRow key={b.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link
                        href={`/app/finance/batches/${b.id}`}
                        className="focus-ring rounded font-mono text-sm font-semibold hover:text-brand"
                      >
                        {b.batchNumber}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Plane className="h-3 w-3" />
                        {t(locale, ORIGIN_LABELS[b.origin as keyof typeof ORIGIN_LABELS] ?? b.origin)}
                        {b.arrivedAt ? ` · ${formatDate(b.arrivedAt, locale)}` : ""}
                        {` · ${b.cargo} ${t(locale, "consignments")}`}
                        {meta ? (
                          <Badge variant={meta.tone} className="ml-1">
                            {t(locale, meta.label)}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {show(b.expectedLocal, b.expectedUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {show(b.collectedLocal, b.collectedUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {show(b.outstandingLocal, b.outstandingUsd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {show(b.expensesLocal, b.expensesUsd)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${b.profitUsd >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {show(b.profitLocal, b.profitUsd)}
                    </TableCell>
                    <TableCell className="w-8">
                      <Link
                        href={`/app/finance/batches/${b.id}`}
                        className="focus-ring inline-flex rounded text-muted-foreground hover:text-brand"
                        aria-label={`${t(locale, "Open")} ${b.batchNumber}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
