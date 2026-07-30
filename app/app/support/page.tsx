import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Headset,
  MessageSquare,
  PhoneCall,
  ReceiptText,
  ShoppingBag,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { QuickAction, SupportSearch } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { followUpQueue, supportOverview } from "@/lib/support";

export const metadata: Metadata = { title: "Support desk" };

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "border-destructive/40 text-destructive",
  HIGH: "border-warning/40 text-warning",
  NORMAL: "text-muted-foreground",
  LOW: "text-muted-foreground",
};

/**
 * The support desk's home.
 *
 * Ordered by what the desk is answerable for: who is waiting on us, then what
 * money is waiting on a phone call, then the wider picture. Everything is a
 * link — this page is a launchpad, not a report.
 */
export default async function SupportHome() {
  await requirePermission("ticket.manage");

  const [overview, queue, tickets, requests] = await Promise.all([
    supportOverview(),
    followUpQueue(),
    prisma.supportTicket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 6,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true } },
        contactName: true,
      },
    }),
    prisma.sourcingRequest.findMany({
      where: { status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 5,
      select: {
        id: true,
        requestNumber: true,
        product: true,
        status: true,
        priority: true,
        customer: { select: { name: true } },
        contactName: true,
      },
    }),
  ]);

  const topOfQueue = queue.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Support desk"
        description="Everything a customer might ask, answerable from this screen."
      />

      <div className="mb-6 rounded-xl border bg-card p-4 shadow-soft">
        <p className="mb-2 text-sm font-medium">Find a shipment</p>
        <SupportSearch action="/app/support/search" />
        <p className="mt-2 text-xs text-muted-foreground">
          Works with a tracking number, a customer&rsquo;s name, the number they
          are calling from, a batch number or an invoice number.
        </p>
      </div>

      {/* Today */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Today
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Open tickets"
          numeric={overview.openTickets}
          hint={
            overview.urgentTickets > 0
              ? `${overview.urgentTickets} high or urgent`
              : "Nothing urgent"
          }
          icon={MessageSquare}
          tone={overview.urgentTickets > 0 ? "warning" : "brand"}
          href="/app/support/tickets"
        />
        <KpiCard
          label="Sourcing requests"
          numeric={overview.openRequests}
          hint={`${overview.requestsToday} opened today`}
          icon={ShoppingBag}
          tone="info"
          href="/app/support/sourcing"
        />
        <KpiCard
          label="Invoices not yet sent"
          numeric={overview.unsentInvoices}
          hint="Customer has not been told what they owe"
          icon={ReceiptText}
          tone={overview.unsentInvoices > 0 ? "warning" : "success"}
          href="/app/support/follow-up?filter=not-sent"
        />
        <KpiCard
          label="Outstanding"
          value={formatUsd(overview.outstanding)}
          hint={`Across ${overview.unpaidCount} unpaid invoice${overview.unpaidCount === 1 ? "" : "s"}`}
          icon={PhoneCall}
          tone={overview.outstanding > 0 ? "danger" : "success"}
          href="/app/support/follow-up?filter=awaiting-payment"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Follow-up */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="flex items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-semibold">Call these customers first</h2>
                <p className="text-sm text-muted-foreground">
                  Ranked by what it is costing them and us.
                </p>
              </div>
              <Link
                href="/app/support/follow-up"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                Full queue
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>
            <ul className="divide-y">
              {topOfQueue.map((row) => (
                <li key={row.shipmentId}>
                  <Link
                    href={`/app/support/follow-up?filter=all#${row.trackingNumber}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{row.customerName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.trackingNumber} · {row.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {row.storageDays > 0 ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {row.storageDays}d storage
                        </Badge>
                      ) : null}
                      <div className="text-right">
                        <p className="text-sm font-medium">{row.nextAction}</p>
                        {row.outstanding !== null && row.outstanding > 0 ? (
                          <p className="font-mono text-xs tabular-nums text-muted-foreground">
                            {formatUsd(row.outstanding)} owed
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
              {topOfQueue.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  Nothing waiting in the Dar warehouse. Quiet day.
                </li>
              ) : null}
            </ul>
          </section>

          {/* Tickets */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="flex items-center justify-between gap-3 border-b p-4">
              <h2 className="font-semibold">Customers waiting on us</h2>
              <Link
                href="/app/support/tickets"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                All tickets
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/app/support/tickets/${ticket.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{ticket.ticketNumber}</span> ·{" "}
                        {ticket.customer?.name ?? ticket.contactName ?? "Unknown caller"}{" "}
                        · {formatDateTime(ticket.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={PRIORITY_TONE[ticket.priority] ?? ""}
                    >
                      {ticket.priority.toLowerCase()}
                    </Badge>
                  </Link>
                </li>
              ))}
              {tickets.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  No open tickets.
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {/* Quick actions */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Quick actions
            </h2>
            <div className="grid gap-3">
              <QuickAction
                href="/app/support/tickets"
                label="Create a support ticket"
                hint="Log a call, a complaint or a price inquiry"
              />
              <QuickAction
                href="/app/support/sourcing"
                label="Create a sourcing request"
                hint="Customer wants something found in China"
              />
              <QuickAction
                href="/app/support/follow-up?filter=invoice-needed"
                label="Raise an invoice"
                hint="Cargo that has landed but was never billed"
              />
              <QuickAction
                href="/app/customers"
                label="Open a customer profile"
                hint="History, balance, previous invoices"
              />
              <QuickAction
                href="/app/support/markets"
                label="China markets directory"
                hint="Recommend the right market for their goods"
              />
            </div>
          </div>

          {/* Customer overview */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Customer overview
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <StatCard
                label="Customers"
                value={overview.customers}
                icon={Users}
                href="/app/customers"
              />
              <StatCard
                label="Active shipments"
                value={overview.activeShipments}
                hint="Registered, flying or waiting in Dar"
                icon={Boxes}
                tone="info"
                href="/app/shipments"
              />
              <StatCard
                label="Ready for pickup"
                value={overview.readyForPickup}
                hint="Paid and waiting to be collected"
                icon={Headset}
                tone="success"
                href="/app/support/follow-up?filter=ready"
              />
              <StatCard
                label="Contacted today"
                value={overview.contactedToday}
                hint="Messages recorded by the desk"
                icon={MessageSquare}
                tone="brand"
              />
            </div>
          </div>

          {/* Sourcing */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">Sourcing in progress</h2>
            </header>
            <ul className="divide-y">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/app/support/sourcing/${request.id}`}
                    className="block p-4 transition-colors hover:bg-accent/40"
                  >
                    <p className="truncate text-sm font-medium">{request.product}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{request.requestNumber}</span> ·{" "}
                      {request.customer?.name ?? request.contactName ?? "Unknown"}
                    </p>
                  </Link>
                </li>
              ))}
              {requests.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No open requests.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
