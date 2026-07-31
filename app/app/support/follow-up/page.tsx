import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
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
  await requirePermission("ticket.manage");
  const { filter } = await searchParams;

  const rows = await followUpQueue();
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
                <td className="p-3 text-right">
                  {row.customerPhone ? (
                    <a
                      href={whatsappLink(
                        row.customerPhone,
                        `Habari ${row.customerName.split(" ")[0]}, kuhusu mzigo wako ${row.trackingNumber}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
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
