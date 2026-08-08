import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Headset,
  MessageSquare,
  PlaneTakeoff,
  QrCode,
  TriangleAlert,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { ActionPills } from "@/components/app/action-pills";
import { SectionLabel } from "@/components/app/section-label";
import { WorkList, type WorkItem } from "@/components/app/work-list";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { CargoSearch } from "@/components/app/cargo-search";
import { QuickAction } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { followUpQueue, supportOverview } from "@/lib/support";

export const metadata: Metadata = { title: "Support desk" };

/**
 * Written out in full, never interpolated.
 *
 * Tailwind generates classes by scanning source text, so `bg-chart-${n}` is
 * a class that never exists — the swatch renders with no colour at all and
 * the legend silently stops matching the chart.
 */
const SWATCH: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};

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
  const user = await requirePermission("ticket.manage");

  // Read the name from the record rather than the session token, which carries
  // whatever it was at sign-in — somebody who renames themselves would be
  // greeted by their old name until they signed out and back in.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  });
  const firstName = (me?.name ?? user.name).split(" ")[0];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const [overview, queue, tickets, requests, rateRow, callBacks, submissions] =
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
    // Collections is this desk's money work now. It had its own workspace and
    // no presence on the page they open first, so a claim Finance sent back
    // sat unseen until somebody thought to go looking for it.
    prisma.paymentSubmission.groupBy({ by: ["status"], _count: true }),
  ]);
  const submissionCount = (status: string) =>
    submissions.find((row) => row.status === status)?._count ?? 0;

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
  /**
   * One classification, used by the list and the picture alike.
   *
   * Same order of precedence followUpQueue uses to pick each row's next
   * action, so a consignment lands in exactly one group and the donut adds up
   * to the queue. Two functions deciding this separately is how a chart ends
   * up disagreeing with the list beside it.
   */
  type Blocker = "unbilled" | "unconfirmed" | "unsent" | "chasing" | "settled";
  const blockerOf = (row: (typeof queue)[number]): Blocker =>
    row.invoiceStatus === null
      ? "unbilled"
      : row.invoiceStatus === "DRAFT"
        ? "unconfirmed"
        : (row.outstanding ?? 0) <= 0
          ? "settled"
          : row.invoiceSentAt === null
            ? "unsent"
            : "chasing";

  const group = (blocker: Blocker) => queue.filter((row) => blockerOf(row) === blocker);
  const unbilled = group("unbilled");
  const unconfirmed = group("unconfirmed");
  const unsent = group("unsent");
  const chasing = group("chasing");
  const settled = group("settled");

  const sum = (rows: typeof queue) =>
    rows.reduce((total, row) => total + (row.outstanding ?? row.total ?? 0), 0);

  /** What the pile is made of, biggest blocker first. */
  const split = [
    { label: "Waiting on Finance", rows: unconfirmed, tone: 4 as const, href: "/app/collections/follow-up" },
    { label: "Never billed", rows: unbilled, tone: 3 as const, href: "/app/collections/follow-up?filter=not-invoiced" },
    { label: "Never sent", rows: unsent, tone: 6 as const, href: "/app/collections/follow-up?filter=not-sent" },
    { label: "Awaiting payment", rows: chasing, tone: 1 as const, href: "/app/collections/follow-up?filter=awaiting-payment" },
    { label: "Paid, not collected", rows: settled, tone: 5 as const, href: "/app/collections/follow-up?filter=ready" },
  ].filter((slice) => slice.rows.length > 0);

  /**
   * How long the queue has been standing.
   *
   * Storage accrues per day and a customer's patience does not, so the shape
   * of this tail is the difference between a busy desk and a bad month. Fixed
   * buckets rather than a line: nobody asks "how many were 9 days old", they
   * ask "how much of this is over a fortnight".
   */
  const AGE_BUCKETS = [
    { label: "0–3d", min: 0, max: 3 },
    { label: "4–7d", min: 4, max: 7 },
    { label: "8–14d", min: 8, max: 14 },
    { label: "15d+", min: 15, max: Infinity },
  ];
  const ageing = AGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    value: queue.filter(
      (row) => row.daysInWarehouse >= bucket.min && row.daysInWarehouse <= bucket.max
    ).length,
  }));
  const stale = queue.filter((row) => row.daysInWarehouse >= 15).length;

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
      href: "/app/collections/follow-up?filter=not-invoiced",
      cta: "Raise the invoice",
      urgent: true,
    },
    {
      when: unsent.length > 0,
      label: `${unsent.length} invoice${unsent.length === 1 ? "" : "s"} never sent`,
      detail:
        "Priced and confirmed, and the customer has still not been told what they owe.",
      usd: sum(unsent),
      href: "/app/collections/follow-up?filter=not-sent",
      cta: "Send it",
      urgent: true,
    },
    {
      when: chasing.length > 0,
      label: `${chasing.length} customer${chasing.length === 1 ? "" : "s"} to chase`,
      detail: "Billed, sent, and the money has not arrived.",
      usd: sum(chasing),
      href: "/app/collections/follow-up?filter=awaiting-payment",
      cta: "Chase",
    },
    {
      // Ahead of the softer queues: a rejected claim means a customer was told
      // their payment went through and it did not.
      when: submissionCount("REJECTED") > 0,
      label: `${submissionCount("REJECTED")} payment${submissionCount("REJECTED") === 1 ? "" : "s"} sent back by Finance`,
      detail:
        "Finance could not verify these. The customer needs ringing before the claim can go up again.",
      href: "/app/collections/submissions?status=REJECTED",
      cta: "See why",
      aside: "needs a call",
      urgent: true,
    },
    {
      when: submissionCount("PENDING") > 0,
      label: `${submissionCount("PENDING")} with Finance`,
      detail:
        "Payments this desk has handed up, waiting to be checked. Nothing to do but watch.",
      href: "/app/collections/submissions?status=PENDING",
      cta: "Track",
      aside: "waiting on Finance",
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
              {today}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              Support desk
            </span>
          </div>
          {/* The person, then the job. Every other desk in the app opens by
              greeting whoever signed in; this one opened on an instruction,
              which made it the only screen that did not know who was reading
              it. */}
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight text-white">
            Habari, {firstName}
          </h1>
          <p className="mt-2 text-sm text-white/80">
            Find a shipment by tracking number, a customer&rsquo;s name, the
            number they are calling from, a batch or an invoice.
          </p>
          <div className="mt-4 max-w-2xl">
            <CargoSearch action="/app/support/search" />
          </div>
        </div>
      </div>

      <div className="mb-7">
        <ActionPills
          items={[
            // Shipments first: whatever the call is about, it starts with a
            // consignment. Collections second, because the next thing asked is
            // what it costs and whether it has been paid.
            // Whatever the call is about it starts with a consignment, and the
            // next thing asked is what it costs and whether it has been paid.
            { href: "/app/shipments", label: "Shipments", icon: PlaneTakeoff, weight: "primary", tone: "brand" },
            { href: "/app/collections", label: "Collections", icon: Banknote, weight: "secondary", tone: "signal" },
            // Investigations rather than Tickets: a case where cargo is
            // missing or short is what this desk is rung about and has to
            // reach mid-call. Tickets keeps its sidebar row.
            { href: "/app/exceptions", label: "Issues & Claims", icon: TriangleAlert, tone: "warning" },
            // Sourcing came out: it has a sidebar row and is a slow job worked
            // through a queue, not something reached with a customer waiting.
            { href: "/app/finance/pickup-notes", label: "Pickup notes", icon: QrCode, tone: "success" },
            { href: "/app/customers", label: "Customers", icon: Users, tone: "info" },
            { href: "/app/batches", label: "Batches", icon: Boxes, tone: "violet" },
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
            href="/app/collections/follow-up"
            className="font-medium text-brand hover:underline"
          >
            see which
          </Link>
          .
        </p>
      ) : null}

      {/* Reference, not work — the shape of the desk's day, which nobody
          acts on. Directly under the list because that is the order the
          question comes in: what needs me, then how big is the desk today.
          Not one of the four repeats a figure from the list above; that is
          the rule that lets them sit this close to it. */}
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
            href="/app/collections/follow-up?filter=ready"
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

      {/* ---- The same queue, as a shape ---------------------------------
          Numbers tell you there are 92; a picture tells you 84 of them are
          behind one desk. Both charts are drawn from the same classification
          the work list uses, so they cannot disagree with it — which is also
          why they sit below the tiles rather than between them and the list:
          the picture explains the queue, and the queue is read first. */}
      <div className="mb-8 mt-7">
        <SectionLabel action={{ href: "/app/collections/follow-up", label: "Full queue" }}>
          Where the queue is stuck
        </SectionLabel>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                slices={split.map((slice) => ({
                  label: slice.label,
                  value: slice.rows.length,
                  tone: slice.tone,
                }))}
                label={String(queue.length)}
                caption="consignments in the warehouse"
              />
              <ul className="min-w-[13rem] flex-1 space-y-1">
                {split.map((slice) => {
                  const money = sum(slice.rows);
                  return (
                    <li key={slice.label}>
                      <Link
                        href={slice.href}
                        className="focus-ring group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SWATCH[slice.tone]}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-xs group-hover:text-brand">
                          {slice.label}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular">
                            {slice.rows.length}
                          </span>
                          {money > 0 ? (
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {rate
                                ? `TSh ${Math.round(money * rate).toLocaleString("en-US")}`
                                : formatUsd(money)}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">How long they have waited</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Days on the floor since the plane landed
                </p>
              </div>
              {stale > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  {stale} over a fortnight
                </span>
              ) : (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  nothing stale
                </span>
              )}
            </div>
            <BarChart
              data={ageing}
              tone={4}
              height={168}
              highlightIndex={ageing.length - 1}
              formatValue={(n) => `${n} consignment${n === 1 ? "" : "s"}`}
            />
          </section>
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
                href="/app/collections/follow-up"
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
                    href={`/app/collections/follow-up?filter=all#${row.trackingNumber}`}
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
                href="/app/collections/follow-up?filter=invoice-needed"
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
