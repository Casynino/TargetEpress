import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Headset,
  MessageSquare,
  PackageSearch,
  PhoneCall,
  ShoppingBag,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { ActionPills } from "@/components/app/action-pills";
import { SectionLabel } from "@/components/app/section-label";
import { WorkList, type WorkItem } from "@/components/app/work-list";
import { QuickAction, SupportSearch } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
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

  const [overview, queue, tickets, requests, rateRow, callBacks] =
    await Promise.all([
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
    currentRate(),
    // Investigations parked on the customer's answer. This desk is the one
    // that rings them, and nothing on the page has ever said so.
    prisma.shipmentException.count({ where: { status: "WAITING_CUSTOMER" } }),
  ]);

  const topOfQueue = queue.slice(0, 6);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  /**
   * What this desk is holding up.
   *
   * Derived from the follow-up queue that is already loaded rather than from
   * six more counts — the queue knows each consignment's next action, so the
   * rows here are that same judgement added up.
   *
   * Only work this desk can actually finish. Cargo whose price Finance has not
   * signed off is deliberately absent: Customer Care cannot confirm a price,
   * and a row that cannot be cleared is a dead end. It is named under the list
   * instead, so nobody wonders why the call queue is full of them.
   */
  const unbilled = queue.filter((row) => row.invoiceStatus === null);
  const unconfirmed = queue.filter((row) => row.invoiceStatus === "DRAFT");
  const unsent = queue.filter(
    (row) =>
      row.invoiceStatus !== null &&
      row.invoiceStatus !== "DRAFT" &&
      row.invoiceSentAt === null
  );
  const chasing = queue.filter(
    (row) => row.invoiceSentAt !== null && (row.outstanding ?? 0) > 0
  );
  const sum = (rows: typeof queue) =>
    rows.reduce((total, row) => total + (row.outstanding ?? row.total ?? 0), 0);

  const jobs: WorkItem[] = [
    {
      when: overview.urgentTickets > 0,
      label: `${overview.urgentTickets} ticket${overview.urgentTickets === 1 ? "" : "s"} marked urgent`,
      detail: "A customer is waiting on an answer somebody flagged as important.",
      href: "/app/support/tickets?priority=high",
      cta: "Answer",
      urgent: true,
    },
    {
      when: unbilled.length > 0,
      label: `${unbilled.length} landed, never billed`,
      detail:
        "In the warehouse with no invoice at all, so the customer has not been asked for anything and storage is running.",
      aside: `oldest ${Math.max(...unbilled.map((r) => r.daysInWarehouse), 0)} days waiting`,
      href: "/app/support/follow-up?filter=not-invoiced",
      cta: "Raise the invoice",
      urgent: true,
    },
    {
      when: unsent.length > 0,
      label: `${unsent.length} invoice${unsent.length === 1 ? "" : "s"} never sent`,
      detail:
        "Priced and confirmed, and the customer has still not been told what they owe.",
      usd: sum(unsent),
      href: "/app/support/follow-up?filter=not-sent",
      cta: "Send it",
      urgent: true,
    },
    {
      when: chasing.length > 0,
      label: `${chasing.length} customer${chasing.length === 1 ? "" : "s"} to chase`,
      detail: "Billed, sent, and the money has not arrived.",
      usd: sum(chasing),
      href: "/app/support/follow-up?filter=awaiting-payment",
      cta: "Chase",
    },
    {
      when: overview.openRequests > 0,
      label: `${overview.openRequests} sourcing request${overview.openRequests === 1 ? "" : "s"} open`,
      detail: "Somebody asked us to find them something in China.",
      href: "/app/support/sourcing",
      cta: "Work them",
    },
    {
      when: callBacks > 0,
      label: `${callBacks} investigation${callBacks === 1 ? "" : "s"} waiting on the customer`,
      detail:
        "A case is parked until somebody rings them back. That call is this desk's.",
      href: "/app/exceptions",
      cta: "Ring them",
    },
  ].filter((job) => job.when) as WorkItem[];

  return (
    <>
      {/* The same band every other department opens onto. The search box lives
          inside it rather than under it: on this desk the phone is already
          ringing when the page loads, and the first thing wanted is the box on
          the other end of the call. */}
      <div className="relative mb-6 overflow-hidden rounded-2xl">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-signal via-brand to-info"
        />
        <div
          aria-hidden
          className="grid-backdrop pointer-events-none absolute inset-0 opacity-20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5"
        />
        <div className="relative p-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            Support desk
          </span>
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight text-white">
            Find a shipment
          </h1>
          <p className="mt-2 text-sm text-white/80">
            A tracking number, a customer&rsquo;s name, the number they are
            calling from, a batch or an invoice — any of them will do.
          </p>
          <div className="mt-4 max-w-2xl">
            <SupportSearch action="/app/support/search" />
          </div>
        </div>
      </div>

      <div className="mb-7">
        <ActionPills
          items={[
            { href: "/app/support/tickets", label: "Tickets", icon: MessageSquare, weight: "primary" },
            { href: "/app/support/follow-up", label: "Chase queue", icon: PhoneCall, weight: "secondary" },
            { href: "/app/support/sourcing", label: "Sourcing", icon: ShoppingBag },
            { href: "/app/customers", label: "Customers", icon: Users },
            { href: "/app/search", label: "Search cargo", icon: PackageSearch },
          ]}
        />
      </div>

      {/* The work first, exactly as the money desk has it. */}
      <SectionLabel count={jobs.length}>Needs your attention</SectionLabel>
      <WorkList
        items={jobs}
        rate={rate}
        empty="Nothing is waiting on you. Every landed consignment is billed, every invoice has been sent, and no customer is owed a call."
      />

      {/* Cargo this desk cannot move, said once, under the list rather than
          in it. The call queue below is full of "Confirm the price" and
          without this line it reads as work nobody is doing. */}
      {unconfirmed.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {unconfirmed.length} more{" "}
          {unconfirmed.length === 1 ? "consignment is" : "consignments are"}{" "}
          waiting on Finance to confirm a price. You cannot bill{" "}
          {unconfirmed.length === 1 ? "it" : "them"} until they do —{" "}
          <Link
            href="/app/support/follow-up"
            className="font-medium text-brand hover:underline"
          >
            see which
          </Link>
          .
        </p>
      ) : null}

      {/* Reference, not work. These four are the shape of the desk's day and
          nobody acts on them — which is precisely why they sit BELOW the list
          rather than above it, and why not one of them repeats a figure from
          it. */}
      <div className="mb-8 mt-7">
        <SectionLabel action={{ href: "/app/customers", label: "All customers" }}>
          The desk &middot; today
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Customers"
            numeric={overview.customers}
            hint="On the books"
            icon={Users}
            tone="brand"
            href="/app/customers"
          />
          <KpiCard
            label="Active shipments"
            numeric={overview.activeShipments}
            hint="Registered, flying or waiting in Dar"
            icon={Boxes}
            tone="info"
            href="/app/shipments"
          />
          <KpiCard
            label="Ready for pickup"
            numeric={overview.readyForPickup}
            hint="Paid and waiting to be collected"
            icon={Headset}
            tone="success"
            href="/app/support/follow-up?filter=ready"
          />
          <KpiCard
            label="Contacted today"
            numeric={overview.contactedToday}
            hint="Calls and messages this desk recorded"
            icon={MessageSquare}
            tone="brand"
          />
        </div>
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
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
