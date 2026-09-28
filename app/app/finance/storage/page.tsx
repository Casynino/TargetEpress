import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Timer, Warehouse } from "lucide-react";

import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { StorageForgive } from "@/components/app/storage-forgive";
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

  /*
    WHY 143 BOXES ARE STANDING HERE — THE OWNER'S OWN QUESTION.

    A hundred and forty-three rows is a list, not an answer. A cargo floor is
    organised by flight, and read that way the list turns into three or four
    facts: one old flight nobody chased, and a recent one that crossed its
    free week this morning. That is something a desk can act on — ring the
    customers on GZ-34 — where a list of rows is something a desk scrolls.
  */
  const flights = new Map<
    string,
    {
      batchNumber: string;
      boxes: number;
      oldestDays: number;
      storageUsd: number;
      pendingUsd: number;
      paidInFull: number;
    }
  >();
  for (const row of rows) {
    const key = row.batchNumber ?? "—";
    const flight = flights.get(key) ?? {
      batchNumber: key,
      boxes: 0,
      oldestDays: 0,
      storageUsd: 0,
      pendingUsd: 0,
      paidInFull: 0,
    };
    flight.boxes += 1;
    flight.oldestDays = Math.max(flight.oldestDays, row.chargeableDays);
    flight.storageUsd += row.owedUsd;
    flight.pendingUsd += pendingOf(row);
    if (row.outstandingUsd <= 0.005) flight.paidInFull += 1;
    flights.set(key, flight);
  }
  const byFlight = [...flights.values()].sort(
    (a, b) => b.oldestDays - a.oldestDays || b.boxes - a.boxes
  );

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

      {can(user.role, "invoice.edit") || wouldBeHeld.length > 0 ? (
        <div className="mb-4 space-y-3 rounded-xl border bg-card p-4 shadow-soft">
          {can(user.role, "invoice.edit") ? <StorageRefresh /> : null}
          {/* Only while there is somebody it would save a wasted journey —
              see the action's own note. */}
          {wouldBeHeld.length > 0 && can(user.role, "invoice.storage.waive") ? (
            <div className="border-t pt-3">
              <StorageForgive
                count={wouldBeHeld.length}
                amount={money(
                  wouldBeHeld.reduce((sum, row) => sum + pendingOf(row), 0)
                )}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {byFlight.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-4 py-3">
            <h2 className="font-display text-sm font-semibold">
              {t(locale, "Where they are")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {t(
                locale,
                "The same cargo by flight. One old flight nobody collected reads very differently from a flight that crossed its free week this morning."
              )}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t(locale, "Flight")}</th>
                  <th className="p-3 font-medium">{t(locale, "Boxes")}</th>
                  <th className="p-3 font-medium">{t(locale, "Longest")}</th>
                  <th className="p-3 font-medium">{t(locale, "Storage")}</th>
                  <th className="p-3 font-medium">
                    {t(locale, "Freight already paid")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byFlight.map((flight) => (
                  <tr key={flight.batchNumber}>
                    <td className="p-3 font-mono text-xs">
                      {flight.batchNumber}
                    </td>
                    <td className="p-3 tabular-nums">{flight.boxes}</td>
                    <td className="p-3 tabular-nums">
                      {flight.oldestDays} {t(locale, "d")}
                    </td>
                    <td className="p-3 font-mono tabular-nums">
                      {money(flight.storageUsd)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {/* How many on this flight owe nothing but the storage —
                          the ones a phone call gets money out of today. */}
                      {flight.paidInFull} {t(locale, "of")} {flight.boxes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
