import "server-only";

import { approvalQueues } from "@/lib/approvals";
import { creditAlerts } from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import type { Locale } from "@/lib/locale";
import { moneyFlow, flowWindow } from "@/lib/manager-series";
import { financeDashboard } from "@/lib/finance-dashboard";
import { monthWindow, profitByDispatch } from "@/lib/profit";
import { prisma } from "@/lib/prisma";
import { deskPulse, ownerAttention } from "@/lib/queries";
import { reconciliation } from "@/lib/reconciliation";
import { pendingPayrollApproval } from "@/lib/payroll";
import { submittedStatements } from "@/lib/statements";
import { supportOverview } from "@/lib/support";

/**
 * Everything the manager's home draws, from one place, in one round trip.
 *
 * ONE SOURCE PER METRIC, and that is the point of the file rather than a
 * convenience. The page it feeds used to call nine engines directly and compose
 * them in the markup, which is how the same figure came to be printed in five
 * places and how two of those copies came to disagree. Here every number is
 * named once, derived once, and handed over — if a figure is on the screen twice
 * it is because somebody rendered this object twice, which is a thing you can
 * see in a diff.
 *
 * LIVE STATE AND DATED ANALYTICS ARE SEPARATE, deliberately. `now` is what is
 * true this second — cargo on the floor, accounts, queues — and no date filter
 * touches it, because "how much is standing in the warehouse" has no date range.
 * `period` is the money over a chosen stretch. Mixing them is how a dashboard
 * ends up claiming there were no consignments last week.
 */

export type ManagerHome = Awaited<ReturnType<typeof managerHome>>;

export async function managerHome(locale: Locale, rangeKey?: string) {
  const now = new Date();
  const flow = flowWindow(rangeKey, now);
  const thisMonth = monthWindow(0);

  const [
    rate,
    fin,
    series,
    attnItems,
    alerts,
    desks,
    queues,
    checks,
    statements,
    payrollWaiting,
    activity,
    support,
    flights,
    staffRows,
    customerCount,
  ] = await Promise.all([
    currentRateValue(),
    /* The money engine every finance screen already reads. Month-scoped: the
       hero states the month's performance, and the chart beside it carries the
       chosen range — two questions, and the labels say which is which. */
    financeDashboard(thisMonth, monthWindow(1)),
    moneyFlow(flow.window, locale),
    currentRateValue().then((r) => ownerAttention(r, locale)),
    creditAlerts(now),
    currentRateValue().then((r) => deskPulse(r, locale)),
    approvalQueues(now),
    reconciliation(),
    submittedStatements(),
    pendingPayrollApproval(now),
    businessActivity(6),
    supportOverview(),
    profitByDispatch(4),
    prisma.user.findMany({
      where: { active: true },
      select: { status: true, department: true },
    }),
    prisma.customer.count(),
  ]);

  const pl = fin.pl;

  /* Cargo, live. Counted here rather than pulled from four engines because each
     of those answers a slightly different question and the differences are what
     put three versions of "78" on one screen. */
  const [loading, inAir, arrived, onFloor, readyForPickup, delayed, openCases] =
    await Promise.all([
      prisma.batch.count({ where: { status: { in: ["OPEN", "FULL", "READY_TO_DEPART"] } } }),
      prisma.batch.count({ where: { status: "IN_TRANSIT" } }),
      prisma.batch.count({ where: { status: "ARRIVED" } }),
      prisma.shipment.count({ where: { status: "RECEIVED_AT_DAR" } }),
      prisma.shipment.count({ where: { status: "READY_FOR_PICKUP" } }),
      prisma.shipment.count({
        where: {
          status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
          arrivedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) },
        },
      }),
      prisma.shipmentException.count({
        where: { status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
      }),
    ]);

  const collectedThisMonth = await prisma.payment.aggregate({
    where: { paidAt: { gte: thisMonth.from, lt: thisMonth.to }, voidedAt: null },
    _sum: { creditedAmount: true },
  });

  return {
    rate,
    /* THE HERO. One month, five figures, and profit is the one that leads. */
    period: {
      label: thisMonth.label,
      revenueUsd: pl.revenue,
      collectedUsd: toNumber(collectedThisMonth._sum.creditedAmount ?? 0),
      outstandingUsd: fin.position.receivableUsd,
      expensesUsd: pl.costs,
      profitUsd: pl.profit,
      marginPct: pl.revenue > 0 ? (pl.profit / pl.revenue) * 100 : null,
    },

    /* THE CHART. Its own range, stated in its own caption. */
    flow: { ...series, rangeKey: flow.key, rangeLabel: flow.label },

    /* WHERE THE MONEY IS — a different question from how it performed.
       Shillings already, converted per account where each one's own currency is
       known; see the note in lib/manager-overview.ts about the two rates. */
    position: (() => {
      const held = (kind: string) =>
        fin.position.accounts
          .filter((a) => a.kind === kind)
          .reduce(
            (n, a) =>
              n +
              (rate === null
                ? a.balanceUsd
                : a.currency === "TZS"
                  ? a.balance
                  : a.balance * rate),
            0
          );
      return {
        bankTzs: held("BANK"),
        mobileTzs: held("MOBILE_MONEY"),
        cashTzs: held("CASH"),
        receivableUsd: fin.position.receivableUsd,
        creditUsd: pl.credit?.outstandingUsd ?? 0,
      };
    })(),

    /* OPERATIONS, live. */
    ops: { loading, inAir, arrived, onFloor, readyForPickup, delayed, openCases },

    /* WHAT NEEDS A DECISION. Composed from the engines that own each queue —
       nothing counted twice, and every entry carries where to go. */
    attention: { items: attnItems, alerts, queues, checks, statements, payrollWaiting },

    /* DEPARTMENTS — the four desks, from the engine the owner's screen reads. */
    desks,

    staff: {
      total: staffRows.length,
      suspended: staffRows.filter((s) => s.status === "SUSPENDED").length,
      byDepartment: staffRows.reduce<Record<string, number>>((acc, s) => {
        acc[s.department] = (acc[s.department] ?? 0) + 1;
        return acc;
      }, {}),
    },

    customers: {
      total: customerCount,
      openTickets: support.openTickets,
    },

    /* Top flights by profit — a summary, not the register. */
    flights,
    activity,
  };
}

/**
 * Recent activity, filtered to things that changed the business.
 *
 * The audit log records everything, correctly — signing in is a privileged
 * action and a security trail that omitted it would be worthless. But a manager's
 * dashboard showing six rows of "Scouth signed in" tells them nothing they can
 * act on, and it crowds out the row that says a payment was recorded.
 *
 * So the feed asks for a wider slice and drops the housekeeping: sessions, page
 * views and reads. What is left is money moving, cargo moving, and decisions
 * being taken. The full log keeps everything and is one press away.
 */
const HOUSEKEEPING = /^(auth\.|session\.|user\.login|user\.logout|.*\.view$|.*\.read$)/;

export async function businessActivity(take = 6) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    /* A wide slice, because sign-ins vastly outnumber business events — the
       local log ran forty deep without one. Capped so a quiet week cannot turn
       this into a table scan. */
    take: Math.min(take * 25, 200),
    select: {
      id: true,
      action: true,
      summary: true,
      createdAt: true,
      actorEmail: true,
      actor: { select: { name: true } },
    },
  });

  return rows.filter((r) => !HOUSEKEEPING.test(r.action)).slice(0, take);
}
