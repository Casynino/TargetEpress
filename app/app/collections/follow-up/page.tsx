import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Download, FileText, MessageCircle } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { currentRate, formatUsd } from "@/lib/fx";
import { toNumber } from "@/lib/format";
import { collectionsOverview } from "@/lib/collections";
import { t } from "@/lib/i18n";
import { paymentReminderSwahili, whatsappLink } from "@/lib/messages";
import { requirePermission } from "@/lib/session";
import {
  FOLLOW_UP_FILTERS,
  followUpQueue,
  matchesFilter,
  type FollowUpFilter,
} from "@/lib/support";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Payment follow-up") };
}

/**
 * The chase list.
 *
 * One flat table, ranked, with the counts on every filter computed from the
 * whole queue rather than the visible page — a desk that works a queue needs to
 * trust the number on the pill.
 *
 * It lives under /app/collections, not /app/support, because chasing a payment
 * is not a support-desk activity — it is the collections job, and Finance does
 * more of it than Support does. Under the support prefix it was gated on
 * ticket.manage, which Finance does not hold, so every link Finance had to this
 * page — from their own ledger, their dashboard and the Collections tab row —
 * landed on "That area is not yours".
 *
 * The body was always role-aware and is unchanged: whoever can record a payment
 * records it, and whoever can only submit one submits it for verification.
 */
export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requirePermission("collections.view");
  const locale = await viewerLocale();
  const canRecord = can(user.role, "payment.record");
  const canCollect = !canRecord && can(user.role, "payment.submit");
  const { filter } = await searchParams;

  const rows = await followUpQueue();

  /**
   * Shillings for the band totals.
   *
   * Each ROW converts at its own invoice's frozen rate — that is the figure
   * the customer was quoted. A total across many invoices has no single frozen
   * rate to use, so it converts at today's published one and is a live
   * estimate rather than a sum of quoted figures. The dollar figure beneath it
   * is the exact one.
   */
  const [rateRow, overview] = await Promise.all([
    currentRate(),
    collectionsOverview(),
  ]);
  const liveRate = rateRow ? toNumber(rateRow.rate) : null;
  const tsh = (usd: number) =>
    liveRate ? `TZS ${Math.round(usd * liveRate).toLocaleString("en-US")}` : formatUsd(usd);

  /**
   * What the customer reads. Built here so the figures come off the same row
   * the clerk is looking at, and so nobody composes the same message eighty
   * times a day.
   */
  const invoiceMessage = (row: (typeof rows)[number]) =>
    paymentReminderSwahili({
      customerName: row.customerName,
      trackingNumber: row.trackingNumber,
      description: row.description,
      invoiceNumber: row.invoiceNumber,
      weightKg: row.weightKg,
      // The invoice's own rate, so the figure the customer was quoted is the
      // figure they are reminded of.
      exchangeRate: row.exchangeRate,
      amountUsd: row.outstanding,
      amountLocal: row.outstandingLocal,
      localCurrency: row.localCurrency,
    });
  const active = (FOLLOW_UP_FILTERS.find((f) => f.key === filter)?.key ??
    "all") as FollowUpFilter;
  const visible = rows.filter((row) => matchesFilter(row, active));

  const totalOutstanding = visible.reduce(
    (sum, row) => sum + (row.outstanding ?? 0),
    0
  );
  const storageAtRisk = visible.reduce((sum, row) => sum + row.storageCharge, 0);

  return (
    <>
      <PageHeader
        title="Payment follow-up"
        description="Cargo sitting in Dar es Salaam, ordered by what needs a phone call most."
      />

      <CollectionsNav canVerify={can(user.role, "payment.verify")} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FOLLOW_UP_FILTERS.map((option) => {
          const count = rows.filter((row) => matchesFilter(row, option.key)).length;
          const isActive = option.key === active;
          return (
            <Link
              key={option.key}
              href={`/app/collections/follow-up?filter=${option.key}`}
              title={t(locale, option.hint)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {t(locale, option.label)}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  isActive ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-6 rounded-xl border bg-card p-4 text-sm shadow-soft">
        <div>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Cargo shown")}
          </p>
          <p className="font-display text-xl font-bold tabular-nums">{visible.length}</p>
        </div>
        {/* Shillings lead, here as everywhere. Freight is priced in dollars
            and paid in shillings: the customer on the phone is quoting
            shillings and so is the clerk. The invoice figure stays underneath,
            smaller, for matching against the bill that was sent. */}
        <div>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Money outstanding")}
          </p>
          <p className="font-display text-xl font-bold tabular-nums">
            {tsh(totalOutstanding)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatUsd(totalOutstanding)} {t(locale, "on the invoices")}
          </p>
        </div>
        {/*
          The two figures the dashboard existed to show, folded in.

          Everything else on that page was either a repeat of this list or a
          card describing it. What could not be read off the rows is how many
          claims are sitting with this desk and how many it has cleared today,
          so those come along — as two more small cells, not a page.
        */}
        <div>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Waiting on you to verify")}
          </p>
          <p
            className={`font-display text-xl font-bold tabular-nums ${
              overview.pendingCount > 0 ? "text-warning" : ""
            }`}
          >
            {overview.pendingCount}
          </p>
          {overview.pendingCount > 0 ? (
            <Link
              href="/app/collections/verify"
              className="text-xs text-brand hover:underline"
            >
              {t(locale, "Verify them")} →
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(locale, "nothing handed up")}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Verified today")}
          </p>
          <p className="font-display text-xl font-bold tabular-nums text-success">
            {overview.verifiedToday}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Storage charges accrued")}
          </p>
          <p className="font-display text-xl font-bold tabular-nums">
            {tsh(storageAtRisk)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatUsd(storageAtRisk)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">{t(locale, "Customer")}</th>
              <th className="p-3 font-medium">{t(locale, "Cargo")}</th>
              <th className="hidden p-3 font-medium lg:table-cell">
                {t(locale, "In warehouse")}
              </th>
              <th className="p-3 font-medium">{t(locale, "Owed")}</th>
              <th className="p-3 font-medium">{t(locale, "Next action")}</th>
              <th className="p-3 text-right font-medium">
                {t(locale, "Reach them")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.shipmentId} id={row.trackingNumber} className="border-t align-top">
                <td className="p-3">
                  <Link
                    href={`/app/customers/${row.customerId}`}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {row.customerName}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {row.customerPhone ?? t(locale, "no phone on file")}
                  </div>
                </td>
                <td className="p-3">
                  <Link
                    href={`/app/cargo/${row.trackingNumber}`}
                    className="font-mono text-xs hover:text-brand hover:underline"
                  >
                    {row.trackingNumber}
                  </Link>
                  <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
                    {row.description}
                  </div>
                </td>
                <td className="hidden p-3 lg:table-cell">
                  <span className="tabular-nums">{row.daysInWarehouse}d</span>
                  {row.storageDays > 0 ? (
                    <Badge
                      variant="outline"
                      className="ml-2 border-destructive/40 text-destructive"
                    >
                      +{formatUsd(row.storageCharge)}
                    </Badge>
                  ) : null}
                </td>
                <td className="p-3 font-mono tabular-nums">
                  {row.outstanding === null ? (
                    <span className="text-muted-foreground">
                      {t(locale, "not billed")}
                    </span>
                  ) : row.outstanding <= 0 ? (
                    <span className="text-success">{t(locale, "paid")}</span>
                  ) : (
                    <>
                      {/* What the customer will actually send, first. */}
                      <div className="font-semibold">
                        {row.outstandingLocal !== null
                          ? `${row.localCurrency ?? "TZS"} ${row.outstandingLocal.toLocaleString()}`
                          : formatUsd(row.outstanding)}
                      </div>
                      {row.outstandingLocal !== null ? (
                        <div className="text-xs text-muted-foreground">
                          {formatUsd(row.outstanding)}
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="p-3">
                  <span className="font-medium">
                    {t(locale, row.nextAction)}
                  </span>
                  {row.invoiceId ? (
                    <div className="mt-0.5">
                      <Link
                        href={`/app/finance/invoices/${row.invoiceId}`}
                        className="font-mono text-xs text-brand hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      <Link
                        href={`/app/cargo/${row.trackingNumber}`}
                        className="text-xs text-brand hover:underline"
                      >
                        {t(locale, "Open cargo")}
                      </Link>
                    </div>
                  )}
                </td>
                <td className="p-3">
                  {/* One icon per thing you can do, all the same size, each
                      carrying its own colour so the hand can find it without
                      reading: green message, blue money, violet download, amber
                      bill. Deliberately not `info` for any of them — it is 205°
                      against brand's 213° and the two read as one colour at
                      14px.
                      "Send invoice" and "Remind" both opened WhatsApp with the
                      identical message — one action wearing two buttons, and
                      the row was wide enough to make you read both before
                      picking. Sending is not a step any more either: invoices
                      are generated, so the only message this desk sends is a
                      reminder, and there is one button for it. */}
                  <div className="flex items-center justify-end gap-1.5">
                    {row.customerPhone ? (
                      <a
                        href={whatsappLink(
                          row.customerPhone,
                          row.invoiceId
                            ? invoiceMessage(row)
                            : `Habari ${row.customerName.split(" ")[0]}, kuhusu mzigo wako ${row.trackingNumber}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={
                          row.invoiceId
                            ? `${t(locale, "Remind")} ${row.customerName} ${t(locale, "on WhatsApp — the bill, the accounts and the amount")}`
                            : `${t(locale, "Message")} ${row.customerName} ${t(locale, "on WhatsApp")}`
                        }
                        aria-label={`WhatsApp ${row.customerName}`}
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-success/40 text-success transition-colors hover:bg-success/10"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    ) : null}

                    {(canRecord || canCollect) &&
                    row.invoiceId &&
                    row.invoiceStatus !== "DRAFT" &&
                    row.outstanding !== null &&
                    row.outstanding > 0 ? (
                      <Link
                        href={
                          canRecord
                            ? `/app/cargo/${row.trackingNumber}`
                            : `/app/collections/record/${row.invoiceId}`
                        }
                        title={
                          canRecord
                            ? t(locale, "Record a payment against this cargo")
                            : t(
                                locale,
                                "Collect the customer's proof and hand it to Finance"
                              )
                        }
                        aria-label={`${t(locale, "Record a payment for")} ${row.trackingNumber}`}
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand/40 text-brand transition-colors hover:bg-brand/10"
                      >
                        <Banknote className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}

                    {/* The bill itself: hand it over, or open it to change
                        something before the customer is asked to pay. */}
                    {row.invoiceNumber ? (
                      <>
                        <a
                          href={`/app/finance/invoices/${row.invoiceNumber}/pdf`}
                          title={`${t(locale, "Download")} ${row.invoiceNumber} ${t(locale, "as a PDF")}`}
                          aria-label={`${t(locale, "Download")} ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-chart-6/40 text-chart-6 transition-colors hover:bg-chart-6/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <Link
                          href={`/app/finance/invoices/${row.invoiceId}`}
                          title={`${t(locale, "Open")} ${row.invoiceNumber}`}
                          aria-label={`${t(locale, "Open")} ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-warning/40 text-warning transition-colors hover:bg-warning/10"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  {t(locale, "Nothing in this queue. Nothing to chase.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
