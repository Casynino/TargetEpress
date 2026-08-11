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
import { AttentionCenter, type AttnItem } from "@/components/app/attention-center";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { FlowBars } from "@/components/charts/flow-bars";
import { CargoSearch } from "@/components/app/cargo-search";
import { QuickAction } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { followUpQueue, supportOverview, ticketFlowByDay } from "@/lib/support";
import { cargoText, viewerLocale } from "@/lib/viewer";

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
  const locale = await viewerLocale();

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

  const [
    overview,
    queue,
    tickets,
    requests,
    rateRow,
    callBacks,
    submissions,
    ticketFlow,
  ] = await Promise.all([
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
    // Whether this desk is keeping up, which the open count cannot say.
    ticketFlowByDay(14),
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
  /**
   * Paid, or not paid.
   *
   * This used to sort the queue into five states — never billed, waiting on
   * Finance to confirm a price, billed but never sent, chasing, settled — from
   * when raising and sending an invoice were separate jobs somebody had to
   * remember. Every invoice is generated automatically now, so three of those
   * described work that no longer exists and two of them were permanently
   * empty. The desk's real question about cargo sitting in Dar is whether the
   * money has arrived.
   */
  type Blocker = "chasing" | "settled";
  const blockerOf = (row: (typeof queue)[number]): Blocker =>
    (row.outstanding ?? 0) <= 0 ? "settled" : "chasing";

  const group = (blocker: Blocker) => queue.filter((row) => blockerOf(row) === blocker);
  const chasing = group("chasing");
  const settled = group("settled");

  const sum = (rows: typeof queue) =>
    rows.reduce((total, row) => total + (row.outstanding ?? row.total ?? 0), 0);

  /** What the pile is made of, biggest blocker first. */
  const split = [
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
    label: t(locale, bucket.label),
    value: queue.filter(
      (row) => row.daysInWarehouse >= bucket.min && row.daysInWarehouse <= bucket.max
    ).length,
  }));
  const stale = queue.filter((row) => row.daysInWarehouse >= 15).length;

  const jobs = [
    {
      group: "Tickets",
      when: overview.urgentTickets > 0,
      label: `${overview.urgentTickets} ticket${overview.urgentTickets === 1 ? "" : "s"} marked urgent`,
      detail: t(locale, "A customer is waiting on an answer somebody flagged as important."),
      href: "/app/support/tickets?priority=high",
      cta: t(locale, "Answer"),
      urgent: true,
    },
    {
      group: "Collections",
      when: chasing.length > 0,
      label: `${chasing.length} customer${chasing.length === 1 ? "" : "s"} to chase`,
      detail: t(locale, "Billed, and the money has not arrived."),
      usd: sum(chasing),
      href: "/app/collections/follow-up?filter=awaiting-payment",
      cta: t(locale, "Chase"),
    },
    {
      group: "Collections",
      // Ahead of the softer queues: a rejected claim means a customer was told
      // their payment went through and it did not.
      when: submissionCount("REJECTED") > 0,
      label: `${submissionCount("REJECTED")} payment${submissionCount("REJECTED") === 1 ? "" : "s"} sent back by Finance`,
      detail: t(
        locale,
        "Finance could not verify these. The customer needs ringing before the claim can go up again."
      ),
      href: "/app/collections/submissions?status=REJECTED",
      cta: t(locale, "See why"),
      aside: t(locale, "needs a call"),
      urgent: true,
    },
    {
      group: "Collections",
      when: submissionCount("PENDING") > 0,
      label: `${submissionCount("PENDING")} with Finance`,
      detail: t(
        locale,
        "Payments this desk has handed up, waiting to be checked. Nothing to do but watch."
      ),
      href: "/app/collections/submissions?status=PENDING",
      cta: t(locale, "Track"),
      aside: t(locale, "waiting on Finance"),
    },
    {
      group: "Sourcing",
      when: overview.openRequests > 0,
      label: `${overview.openRequests} sourcing request${overview.openRequests === 1 ? "" : "s"} open`,
      detail: t(locale, "Somebody asked us to find them something in China."),
      href: "/app/support/sourcing",
      cta: t(locale, "Work them"),
    },
    {
      group: "Cases",
      when: callBacks > 0,
      label: `${callBacks} investigation${callBacks === 1 ? "" : "s"} waiting on the customer`,
      detail: t(
        locale,
        "A case is parked until somebody rings them back. That call is this desk's."
      ),
      href: "/app/exceptions",
      cta: t(locale, "Ring them"),
    },
  ].filter((job) => job.when);

  /**
   * The same panel the warehouse floor and the money desk use.
   *
   * One heading, fixed height, pills that filter — rather than a band that grows
   * a row every time this desk acquires another kind of thing to chase.
   */
  const attention: AttnItem[] = jobs.map((job) => ({
    id: job.href,
    group: job.group,
    severity: (job.urgent ? "critical" : "info") as AttnItem["severity"],
    label: job.label,
    detail: job.detail,
    href: job.href,
    value:
      job.usd !== undefined && rate
        ? `TSh ${Math.round(job.usd * rate).toLocaleString("en-US")}`
        : job.aside,
    valueSub: job.usd !== undefined ? formatUsd(job.usd) : undefined,
  }));

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
              {t(locale, "Support desk")}
            </span>
          </div>
          {/* The person, then the job. Every other desk in the app opens by
              greeting whoever signed in; this one opened on an instruction,
              which made it the only screen that did not know who was reading
              it. */}
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight text-white">
            {t(locale, "Habari")}, {firstName}
          </h1>
          <p className="mt-2 text-sm text-white/80">
            {t(
              locale,
              "Find a shipment by tracking number, a customer’s name, the number they are calling from, a batch or an invoice."
            )}
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
            { href: "/app/shipments", label: t(locale, "Shipments"), icon: PlaneTakeoff, weight: "primary", tone: "brand" },
            { href: "/app/collections", label: t(locale, "Collections"), icon: Banknote, weight: "secondary", tone: "signal" },
            // Investigations rather than Tickets: a case where cargo is
            // missing or short is what this desk is rung about and has to
            // reach mid-call. Tickets keeps its sidebar row.
            { href: "/app/exceptions", label: t(locale, "Issues & Claims"), icon: TriangleAlert, tone: "warning" },
            // Sourcing came out: it has a sidebar row and is a slow job worked
            // through a queue, not something reached with a customer waiting.
            { href: "/app/finance/pickup-notes", label: t(locale, "Pickup notes"), icon: QrCode, tone: "success" },
            { href: "/app/customers", label: t(locale, "Customers"), icon: Users, tone: "info" },
            { href: "/app/batches", label: t(locale, "Batches"), icon: Boxes, tone: "violet" },
          ]}
        />
      </div>

      {/* The work first, exactly as the money desk and the floor have it. */}
      <AttentionCenter
        items={attention}
        reviewAll={{ href: "/app/collections/follow-up", label: t(locale, "The call list") }}
        empty={t(
          locale,
          "Nothing is waiting on you. Every landed consignment is billed and no customer is owed a call."
        )}
      />


      {/* Reference, not work — the shape of the desk's day, which nobody
          acts on. Directly under the list because that is the order the
          question comes in: what needs me, then how big is the desk today.
          Not one of the four repeats a figure from the list above; that is
          the rule that lets them sit this close to it. */}
      <div className="mb-8 mt-7">
        <SectionLabel action={{ href: "/app/customers", label: t(locale, "All customers") }}>
          {t(locale, "The desk · today")}
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={t(locale, "Customers")}
            numeric={overview.customers}
            hint={t(locale, "On the books")}
            icon={Users}
            tone="brand"
            href="/app/customers"
          />
          <KpiCard
            label={t(locale, "Active shipments")}
            numeric={overview.activeShipments}
            hint={t(locale, "Registered, flying or waiting in Dar")}
            icon={Boxes}
            tone="info"
            href="/app/shipments"
          />
          <KpiCard
            label={t(locale, "Ready for pickup")}
            numeric={overview.readyForPickup}
            hint={t(locale, "Paid and waiting to be collected")}
            icon={Headset}
            tone="success"
            href="/app/collections/follow-up?filter=ready"
          />
          <KpiCard
            label={t(locale, "Contacted today")}
            numeric={overview.contactedToday}
            hint={t(locale, "Calls and messages this desk recorded")}
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
        <SectionLabel action={{ href: "/app/collections/follow-up", label: t(locale, "Full queue") }}>
          {t(locale, "Where the queue is stuck")}
        </SectionLabel>
        {/* Three cards, one row — the rhythm the warehouse floors and the money
            desk use. Two answer "what is stuck, and for how long"; the third
            answers the one a count can never show, which is whether this desk
            is keeping up at all. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold">{t(locale, "What the queue is made of")}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t(locale, "Every consignment in Dar, by what is holding it")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <Donut
                slices={split.map((slice) => ({
                  label: t(locale, slice.label),
                  value: slice.rows.length,
                  tone: slice.tone,
                }))}
                label={String(queue.length)}
                caption={t(locale, "consignments in the warehouse")}
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
                          {t(locale, slice.label)}
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

          <section className="panel p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t(locale, "How long they have waited")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Days on the floor since the plane landed")}
                </p>
              </div>
              {stale > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  {stale} {t(locale, "over a fortnight")}
                </span>
              ) : (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  {t(locale, "nothing stale")}
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

          {/* Opened against closed. A desk with forty tickets open is fine if
              it closes forty a day and in trouble if it closes none — and the
              open count on its own reads identically either way. */}
          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "Opened and closed")}</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t(locale, "Tickets raised against tickets finished, a fortnight")}
                </p>
              </div>
              <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                <span className="font-mono font-semibold text-success">
                  {ticketFlow.inCounts.reduce((a, b) => a + b, 0)}
                </span>
                {" / "}
                <span className="font-mono font-semibold text-signal">
                  {ticketFlow.outCounts.reduce((a, b) => a + b, 0)}
                </span>
              </p>
            </div>
            <FlowBars
              className="mt-3"
              labels={ticketFlow.labels}
              valuesIn={ticketFlow.inCounts}
              valuesOut={ticketFlow.outCounts}
              currentIndex={ticketFlow.currentIndex}
              format={(n) => `${n} ticket${n === 1 ? "" : "s"}`}
              legendIn={t(locale, "Opened")}
              legendOut={t(locale, "Closed")}
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
                <h2 className="font-semibold">{t(locale, "Call these customers first")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t(locale, "Ranked by what it is costing them and us.")}
                </p>
              </div>
              <Link
                href="/app/collections/follow-up"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {t(locale, "Full queue")}
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
                        {row.trackingNumber} · {cargoText(locale, row, "description")}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {row.storageDays > 0 ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {row.storageDays}d {t(locale, "storage")}
                        </Badge>
                      ) : null}
                      <div className="text-right">
                        <p className="text-sm font-medium">{t(locale, row.nextAction)}</p>
                        {row.outstanding !== null && row.outstanding > 0 ? (
                          <p className="font-mono text-xs tabular-nums text-muted-foreground">
                            {formatUsd(row.outstanding)} {t(locale, "owed")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
              {topOfQueue.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  {t(locale, "Nothing waiting in the Dar warehouse. Quiet day.")}
                </li>
              ) : null}
            </ul>
          </section>

          {/* Tickets */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="flex items-center justify-between gap-3 border-b p-4">
              <h2 className="font-semibold">{t(locale, "Customers waiting on us")}</h2>
              <Link
                href="/app/support/tickets"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {t(locale, "All tickets")}
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
                        {ticket.customer?.name ?? ticket.contactName ?? t(locale, "Unknown caller")}{" "}
                        · {formatDateTime(ticket.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={PRIORITY_TONE[ticket.priority] ?? ""}
                    >
                      {t(locale, ticket.priority.toLowerCase())}
                    </Badge>
                  </Link>
                </li>
              ))}
              {tickets.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  {t(locale, "No open tickets.")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {/* Quick actions */}
          <div>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, "Quick actions")}
            </h2>
            <div className="grid gap-3">
              <QuickAction
                href="/app/support/tickets"
                label={t(locale, "Create a support ticket")}
                hint={t(locale, "Log a call, a complaint or a price inquiry")}
              />
              <QuickAction
                href="/app/support/sourcing"
                label={t(locale, "Create a sourcing request")}
                hint={t(locale, "Customer wants something found in China")}
              />
              <QuickAction
                href="/app/collections/follow-up?filter=awaiting-payment"
                label={t(locale, "Chase a payment")}
                hint={t(locale, "Cargo that has been billed and is still unpaid")}
              />
              <QuickAction
                href="/app/customers"
                label={t(locale, "Open a customer profile")}
                hint={t(locale, "History, balance, previous invoices")}
              />
              <QuickAction
                href="/app/support/markets"
                label={t(locale, "China markets directory")}
                hint={t(locale, "Recommend the right market for their goods")}
              />
            </div>
          </div>

          {/* Sourcing */}
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">{t(locale, "Sourcing in progress")}</h2>
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
                      {request.customer?.name ?? request.contactName ?? t(locale, "Unknown")}
                    </p>
                  </Link>
                </li>
              ))}
              {requests.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {t(locale, "No open requests.")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
