import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { PageHeader } from "@/components/app/page-header";
import { SendInvoiceButton } from "@/components/app/send-invoice-button";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/fx";
import { whatsappLink } from "@/lib/messages";
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
   * What the customer reads. Built here rather than in the button so the
   * figures come off the same row the clerk is looking at, and so nobody has
   * to compose the same sentence eighty times a day.
   */
  const invoiceMessage = (row: (typeof rows)[number]) =>
    [
      `Habari ${row.customerName.split(" ")[0]},`,
      `mzigo wako ${row.trackingNumber} (${row.description}) umefika Dar es Salaam.`,
      row.outstanding !== null && row.outstandingLocal !== null
        ? `Malipo: ${row.localCurrency} ${row.outstandingLocal.toLocaleString()}.`
        : row.outstanding !== null
          ? `Malipo: USD ${row.outstanding.toFixed(2)}.`
          : "",
      row.invoiceNumber ? `Ankara: ${row.invoiceNumber}.` : "",
      "Target Express Air Cargo.",
    ]
      .filter(Boolean)
      .join(" ");
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
