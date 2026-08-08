import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, MessageCircle } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { PageHeader } from "@/components/app/page-header";
import { SendInvoiceButton } from "@/components/app/send-invoice-button";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/fx";
import { paymentReminderSwahili, whatsappLink } from "@/lib/messages";
import { requirePermission } from "@/lib/session";
import {
  FOLLOW_UP_FILTERS,
  followUpQueue,
  matchesFilter,
  type FollowUpFilter,
} from "@/lib/support";

export const metadata: Metadata = { title: "Payment follow-up" };

/**
 * The chase list.
 *
 * One flat table, ranked, with the counts on every filter computed from the
 * whole queue rather than the visible page — a desk that works a queue needs to
 * trust the number on the pill.
 */
export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requirePermission("ticket.manage");
  const canSend = can(user.role, "invoice.send");
  const canRecord = can(user.role, "payment.record");
  const canCollect = !canRecord && can(user.role, "payment.submit");
  const { filter } = await searchParams;

  const rows = await followUpQueue();

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
      // Shillings when we know the rate — that is what the customer is
      // sending. The dollar figure is the invoice's, not theirs.
      amount:
        row.outstandingLocal !== null
          ? `${row.localCurrency} ${row.outstandingLocal.toLocaleString()}`
          : `USD ${(row.outstanding ?? 0).toFixed(2)}`,
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

      <CollectionsNav />

      <div className="mb-4 flex flex-wrap gap-2">
        {FOLLOW_UP_FILTERS.map((option) => {
          const count = rows.filter((row) => matchesFilter(row, option.key)).length;
          const isActive = option.key === active;
          return (
            <Link
              key={option.key}
              href={`/app/support/follow-up?filter=${option.key}`}
              title={option.hint}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {option.label}
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
          <p className="text-xs text-muted-foreground">Shipments shown</p>
          <p className="font-display text-xl font-bold tabular-nums">{visible.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Money outstanding</p>
          <p className="font-display text-xl font-bold tabular-nums">
            {formatUsd(totalOutstanding)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Storage charges accrued</p>
          <p className="font-display text-xl font-bold tabular-nums">
            {formatUsd(storageAtRisk)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Shipment</th>
              <th className="hidden p-3 font-medium lg:table-cell">In warehouse</th>
              <th className="p-3 font-medium">Owed</th>
              <th className="p-3 font-medium">Next action</th>
              <th className="hidden p-3 font-medium xl:table-cell">Last contact</th>
              <th className="p-3 text-right font-medium">Reach them</th>
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
                    {row.customerPhone ?? "no phone on file"}
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
                    <span className="text-muted-foreground">not billed</span>
                  ) : row.outstanding <= 0 ? (
                    <span className="text-success">paid</span>
                  ) : (
                    <>
                      {formatUsd(row.outstanding)}
                      {row.outstandingLocal !== null ? (
                        <div className="text-xs text-muted-foreground">
                          {row.localCurrency} {row.outstandingLocal.toLocaleString()}
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="p-3">
                  <span className="font-medium">{row.nextAction}</span>
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
                        Open shipment
                      </Link>
                    </div>
                  )}
                </td>
                <td className="hidden p-3 text-xs text-muted-foreground xl:table-cell">
                  {row.lastContactAt
                    ? new Date(row.lastContactAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "never"}
                  {row.lastContactKind ? (
                    <div className="text-[11px]">{row.lastContactKind.toLowerCase()}</div>
                  ) : null}
                </td>
                <td className="p-3">
                  {/* The next action, as something you can press. Every row
                      said "Send the invoice" or "Chase payment" and then
                      offered no way to do either. */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {canSend &&
                    row.invoiceId &&
                    row.invoiceStatus !== "DRAFT" &&
                    !row.invoiceSentAt ? (
                      <SendInvoiceButton
                        customerId={row.customerId}
                        shipmentId={row.shipmentId}
                        invoiceId={row.invoiceId}
                        whatsapp={
                          row.customerPhone
                            ? whatsappLink(
                                row.customerPhone,
                                invoiceMessage(row)
                              )
                            : null
                        }
                        body={invoiceMessage(row)}
                        alreadySent={false}
                      />
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
                        className="focus-ring inline-flex items-center gap-1 rounded-full border border-brand/40 px-3 py-1.5 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/10"
                      >
                        Record payment
                      </Link>
                    ) : null}

                    {/* The bill itself: hand it over, or open it to change
                        something before the customer is asked to pay. */}
                    {row.invoiceNumber ? (
                      <>
                        <a
                          href={`/app/finance/invoices/${row.invoiceNumber}/pdf`}
                          aria-label={`Download ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <Link
                          href={`/app/finance/invoices/${row.invoiceId}`}
                          aria-label={`Open ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                      </>
                    ) : null}

                    {/* The reminder itself, ready to send, with the accounts
                        in it. Offered on every row with a number and a bill —
                        not only the ones that have never been sent. */}
                    {row.customerPhone && row.invoiceId ? (
                      <a
                        href={whatsappLink(row.customerPhone, invoiceMessage(row))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-success/40 px-3 py-1.5 text-[11px] font-semibold text-success transition-colors hover:bg-success/10"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Remind
                      </a>
                    ) : null}

                    {row.customerPhone ? (
                      <a
                        href={whatsappLink(
                          row.customerPhone,
                          `Habari ${row.customerName.split(" ")[0]}, kuhusu mzigo wako ${row.trackingNumber}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`WhatsApp ${row.customerName}`}
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:border-success/40 hover:text-success"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                  Nothing in this queue. Nothing to chase.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
