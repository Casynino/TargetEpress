import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Timer, Warehouse } from "lucide-react";

import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { StorageRefresh } from "@/components/app/storage-refresh";
import { Badge } from "@/components/ui/badge";
import { STORAGE_POLICY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storageDue } from "@/lib/storage-meter";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Storage") };
}

/**
 * THE DAYS THE FLOOR IS CARRYING.
 *
 * Built because the only way to read what the meter was about to do was a
 * page of raw JSON, and the owner opened it twice and could not act on it.
 * The question it answers is not "what has been charged" — the bills say
 * that — but "what is standing here, whose it is, and what happens when the
 * meter catches up with it".
 *
 * THE COLUMN THAT MATTERS MOST IS NOT THE MONEY. A consignment somebody has
 * already paid for, holding a live pickup note, goes back on the shelf the
 * moment storage lands on its bill — and that customer is turned away at the
 * counter without warning. Those rows are marked, and counted at the top,
 * because a desk should ring them before the meter does it for them.
 */
export default async function StorageDuePage() {
  const user = await requirePermission("accounting.view");
  const locale = await viewerLocale();
  const rows = await storageDue();
  const rate = await currentRateValue();

  /*
    WHAT THE METER WILL ACTUALLY ADD TO THIS BILL.

    Nothing, on a bill somebody has waived — the meter leaves those alone, and
    counting their days as "to come" put a consignment nobody was going to
    charge into the count of customers about to be turned away. The days are
    still shown on the row, marked as waived, because "why is that box not
    being charged" is the question this screen exists to answer.
  */
  const pendingOf = (row: (typeof rows)[number]) =>
    row.waivedUsd > 0.005 ? 0 : Math.max(0, row.owedUsd - row.onBillUsd);
  const notYetOnBills = rows.reduce((sum, row) => sum + pendingOf(row), 0);
  const wouldBeHeld = rows.filter(
    (row) => row.clearedForPickup && pendingOf(row) > 0.005
  );
  const waived = rows.filter((row) => row.waivedUsd > 0.005);
  const money = (usd: number) => formatShillings(usd, rate);

  const tiles = [
    {
      label: "Cargo past its free days",
      value: String(rows.length),
      hint: `${STORAGE_POLICY.freeDays} free days, then USD ${STORAGE_POLICY.perDayUsd} a day`,
      Icon: Warehouse,
      tone: "text-foreground",
    },
    {
      label: "Not on the bills yet",
      value: money(notYetOnBills),
      hint: "The meter puts this on tonight, or press the button below",
      Icon: Timer,
      tone: notYetOnBills > 0.005 ? "text-warning" : "text-success",
    },
    {
      label: "Paid cargo that will be held",
      value: String(wouldBeHeld.length),
      hint: "Cleared to collect today — the storage takes them back off the shelf",
      Icon: AlertTriangle,
      tone: wouldBeHeld.length > 0 ? "text-destructive" : "text-success",
    },
  ] as const;

  return (
    <div className="p-4 sm:p-6">
      <FinanceWorkspaceHeader
        role={user.role}
        title={t(locale, "Storage")}
        description={t(
          locale,
          "Every consignment standing past its free week, what the days have come to, and which of them are already paid for. The meter adds these to the bills by itself every night and again whenever the warehouse scans a box."
        )}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border bg-card p-4 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <tile.Icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                {t(locale, tile.label)}
              </p>
            </div>
            <p
              className={`mt-1.5 font-display text-xl font-bold tabular-nums ${tile.tone}`}
            >
              {tile.value}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t(locale, tile.hint)}
            </p>
          </div>
        ))}
      </div>

      {can(user.role, "invoice.edit") ? (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-soft">
          <StorageRefresh />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t(locale, "Nothing is standing past its free week.")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t(locale, "Customer")}</th>
                  <th className="p-3 font-medium">{t(locale, "Cargo")}</th>
                  <th className="p-3 font-medium">{t(locale, "Days")}</th>
                  <th className="p-3 font-medium">{t(locale, "Storage")}</th>
                  <th className="p-3 font-medium">{t(locale, "On the bill")}</th>
                  <th className="p-3 font-medium">{t(locale, "Still owed")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const pending = pendingOf(row);
                  return (
                    <tr key={row.invoiceId} className="align-top">
                      <td className="p-3">
                        <div className="font-medium">{row.customerName}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.invoiceNumber}
                        </div>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/app/cargo/${row.trackingNumber}`}
                          className="font-mono text-xs hover:text-brand hover:underline"
                        >
                          {row.trackingNumber}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">
                          {row.arrivedAt
                            ? `${t(locale, "landed")} ${formatDate(row.arrivedAt, locale)}`
                            : "—"}
                        </div>
                        {/* The warning that is worth more than the figure
                            beside it — see the note at the top of this file. */}
                        {row.clearedForPickup && pending > 0.005 ? (
                          <Badge
                            variant="outline"
                            className="mt-1 border-destructive/40 text-destructive"
                          >
                            {t(locale, "paid — will be held")}
                          </Badge>
                        ) : null}
                        {row.waivedUsd > 0.005 ? (
                          <Badge
                            variant="outline"
                            className="mt-1 border-warning/40 text-warning"
                          >
                            {t(locale, "waived")} {money(row.waivedUsd)}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-3 tabular-nums">
                        {row.chargeableDays}
                        <span className="block text-[11px] text-muted-foreground">
                          {t(locale, "of")} {row.daysHeld} {t(locale, "here")}
                        </span>
                      </td>
                      <td className="p-3 font-mono tabular-nums">
                        {money(row.owedUsd)}
                      </td>
                      <td className="p-3 font-mono tabular-nums">
                        {money(row.onBillUsd)}
                        {pending > 0.005 ? (
                          <span className="block text-[11px] font-sans text-warning">
                            +{money(pending)} {t(locale, "to come")}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 font-mono tabular-nums">
                        <span
                          className={
                            row.outstandingUsd > 0.005
                              ? "text-destructive"
                              : "text-success"
                          }
                        >
                          {money(Math.max(0, row.outstandingUsd))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {waived.length > 0 ? (
            <p className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
              {waived.length} {t(locale, "consignment(s) have had their storage waived — the meter leaves those alone.")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
