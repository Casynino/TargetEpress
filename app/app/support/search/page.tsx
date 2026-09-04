import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { CargoSearch } from "@/components/app/cargo-search";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { can } from "@/lib/rbac";
import { claimsForInvoices } from "@/lib/claimed";
import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { searchShipments } from "@/lib/support";
import { cargoText, viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Find cargo" };

/**
 * One box, every handle.
 *
 * A customer on the phone has whatever they have — their name, the number they
 * are calling from, a batch number from a WhatsApp group. All of it goes in the
 * same box.
 */
export default async function SupportSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const locale = await viewerLocale();
  const { q } = await searchParams;
  const showMoney = can(user.role, "finance.view");

  const results = q ? await searchShipments(q) : [];

  /*
    WHICH OF THESE HAS ALREADY BEEN PAID FOR.

    This is the box Support reads with the customer on the line, and it showed
    a cargo with a claim already sitting in Finance's queue exactly as it shows
    one nobody has ever paid: the same figure, in the same red. So the desk
    asks a customer who paid on Tuesday to pay again.

    One query for the page. Only when this reader may see money at all — the
    warehouse desks reach this same page and have never seen a figure on it.
  */
  const claims = showMoney
    ? await claimsForInvoices(
        results.map((r) => r.invoice?.id).filter((v): v is string => Boolean(v))
      )
    : new Map();

  return (
    <>
      <PageHeader
        title="Find cargo"
        description="Search by tracking number, customer name, phone number, batch or invoice."
      />

      <div className="mb-6 rounded-xl border bg-card p-4 shadow-soft">
        <CargoSearch action="/app/support/search" defaultValue={q} />
      </div>

      {q ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-foreground">{q}</span>
        </p>
      ) : null}

      {q && results.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center shadow-soft">
          <SearchX className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">Nothing matched</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Try a shorter piece of it — part of a name, or the last few digits of
            the phone number they are calling from.
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <>
        {/*
          Customer Care searches this while somebody is on the phone. Six
          columns on a handset is panning around a spreadsheet with a customer
          waiting, so below md each result is a card: who they are and what they
          sent, the status, and — where the desk is allowed to see money — what
          is owed.
        */}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft md:hidden">
          {results.map((shipment) => {
            const outstanding = shipment.invoice
              ? Math.max(
                  0,
                  toNumber(shipment.invoice.total) -
                    toNumber(shipment.invoice.amountPaid)
                )
              : null;
            return (
              <li key={shipment.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/customers/${shipment.customer.id}`}
                      className="block truncate font-medium hover:text-brand"
                    >
                      {shipment.customer.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">
                      {shipment.customer.phone ?? "no phone"}
                    </p>
                  </div>
                  <ShipmentStatusBadge status={shipment.status} />
                </div>

                <Link
                  href={`/app/cargo/${shipment.trackingNumber}`}
                  className="mt-2 block font-mono text-sm font-semibold hover:text-brand"
                >
                  {shipment.trackingNumber}
                </Link>
                <p className="mt-0.5 line-clamp-2 text-sm">
                  {cargoText(locale, shipment, "description")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatWeight(shipment.weightKg)} · {shipment.packages} pkg ·{" "}
                  {shipment.origin === "GUANGZHOU" ? "Guangzhou" : "Hong Kong"}
                  {shipment.batch ? ` · ${shipment.batch.batchNumber}` : ""}
                </p>

                {showMoney ? (
                  <div className="mt-2 flex items-center gap-2 border-t pt-2 font-mono text-xs tabular-nums">
                    {outstanding === null ? (
                      <span className="text-muted-foreground">not billed</span>
                    ) : outstanding > 0 ? (
                      <span className="text-destructive">
                        {formatUsd(outstanding)} owed
                      </span>
                    ) : (
                      <span className="text-success">paid</span>
                    )}
                    {shipment.invoice && !shipment.invoice.sentAt ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-xs text-warning"
                      >
                        never sent
                      </Badge>
                    ) : null}
                    {/* Beside the figure, never instead of it: the bill still
                        owes this until Finance agrees the claim. */}
                    {/* The same yellow chip this desk sees on the flight
                        manifest and in cargo search — a plain span, because
                        Badge's outline variant sets its own text colour. */}
                    {shipment.invoice && claims.get(shipment.invoice.id) ? (
                      <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                        {t(locale, "Payment to verify")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-soft md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Tracking</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Cargo</th>
                <th className="p-3 font-medium">Status</th>
                <th className="hidden p-3 font-medium lg:table-cell">Batch</th>
                {showMoney ? <th className="p-3 font-medium">Owed</th> : null}
              </tr>
            </thead>
            <tbody>
              {results.map((shipment) => {
                const outstanding = shipment.invoice
                  ? Math.max(
                      0,
                      toNumber(shipment.invoice.total) -
                        toNumber(shipment.invoice.amountPaid)
                    )
                  : null;
                return (
                  <tr key={shipment.id} className="border-t align-top">
                    <td className="p-3">
                      <Link
                        href={`/app/cargo/${shipment.trackingNumber}`}
                        className="font-mono text-xs hover:text-brand hover:underline"
                      >
                        {shipment.trackingNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(shipment.arrivedAt, locale)}
                      </div>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/app/customers/${shipment.customer.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {shipment.customer.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {shipment.customer.phone ?? "no phone"}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="max-w-[16rem] truncate">
                        {cargoText(locale, shipment, "description")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatWeight(shipment.weightKg)} · {shipment.packages} pkg ·{" "}
                        {shipment.origin === "GUANGZHOU" ? "Guangzhou" : "Hong Kong"}
                      </div>
                    </td>
                    <td className="p-3">
                      <ShipmentStatusBadge status={shipment.status} />
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground lg:table-cell">
                      {shipment.batch?.batchNumber ?? "—"}
                    </td>
                    {showMoney ? (
                      <td className="p-3 font-mono text-xs tabular-nums">
                        {outstanding === null ? (
                          <span className="text-muted-foreground">not billed</span>
                        ) : outstanding > 0 ? (
                          <span className="text-destructive">{formatUsd(outstanding)}</span>
                        ) : (
                          <span className="text-success">paid</span>
                        )}
                        {shipment.invoice && !shipment.invoice.sentAt ? (
                          <Badge
                            variant="outline"
                            className="mt-1 block w-fit border-warning/40 text-xs text-warning"
                          >
                            never sent
                          </Badge>
                        ) : null}
                        {shipment.invoice && claims.get(shipment.invoice.id) ? (
                          <span className="mt-1 block w-fit rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                            {t(locale, "Payment to verify")}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : null}
    </>
  );
}
