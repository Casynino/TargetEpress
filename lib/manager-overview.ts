import "server-only";

import type { BatchStatus, Department } from "@prisma/client";

import { approvalQueues, type ApprovalQueue } from "@/lib/approvals";
import { DEPARTMENT_LABELS } from "@/lib/constants";
import { creditAlerts, creditOverview } from "@/lib/credit-queries";
import { financeDashboard, type FinanceDashboard } from "@/lib/finance-dashboard";
import { floorSnapshot, type FloorSnapshot } from "@/lib/floor";
import { formatMonthYear, percentDelta } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings } from "@/lib/money";
import { payrollRoster, payrollRuns, pendingPayrollApproval } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { monthWindow, profitAndLoss, windowFor } from "@/lib/profit";
import { darStats, executiveStats } from "@/lib/queries";
import {
  statementSummary,
  submittedStatements,
  type StatementSummary,
} from "@/lib/statements";
import { supportOverview } from "@/lib/support";

/**
 * "What is happening in my company right now", in one object.
 *
 * COMPOSED, NOT COMPUTED. Every figure below is read off an engine that already
 * answers the question somewhere else in the app — financeDashboard for the
 * money and the account position, profitAndLoss for the period, floorSnapshot
 * for the warehouse, creditOverview for the receivable, approvalQueues,
 * statements and payroll for the decisions. Nothing here re-aggregates what one
 * of them already aggregates, because the manager's screen and the desk's own
 * screen disagreeing about the same number is how a weekly meeting turns into
 * an argument about whose page is right.
 *
 * Four narrow queries are new, and each answers a question NO engine answers:
 * how many batches are still loading in Guangzhou, how many customers signed up
 * this month, the staff roster's own shape, and how many accounts are suspended.
 * They are additions, not second opinions.
 *
 * ONE Promise.all. These are independent reads of the same instant, and running
 * them in sequence would mean the top of the screen describes a different minute
 * from the bottom of it.
 *
 * TWO HONESTY RULES, both load-bearing:
 *
 * There is NO attendance in this schema — no shift, no clock-in, no roster of
 * who was expected. `lastActiveAt` is a heartbeat touched on every authenticated
 * page load, so "seen today" means somebody opened the app, and nothing more.
 * The screen must say so rather than let a manager read it as attendance.
 *
 * There is NO petty-cash model. AccountKind is BANK | MOBILE_MONEY | CASH, and
 * the cash tin in the office is a CASH account like any other. The cash figure
 * is therefore every CASH account added up and is labelled for exactly that.
 */

export type InsightTone = "good" | "warn" | "bad" | "neutral";

export type Insight = {
  id: string;
  tone: InsightTone;
  /** One true sentence, already in the reader's language. */
  text: string;
  /** The screen that explains it. An insight with no way in is a poster. */
  href: string;
  /**
   * How much this ought to move a decision today. The sort key, never printed:
   * a strip ordered by when the query happened to return is a list, not a
   * briefing.
   */
  rank: number;
};

export type ManagerOverview = {
  /** USD→TZS as published. Null when no rate exists — then figures stay in USD. */
  rate: number | null;

  operations: {
    /** Batches still filling or sealed in Guangzhou, not yet in the air. */
    batchesLoading: number;
    /** Flights in the air. Batches, not consignments. */
    batchesInAir: number;
    /** Landed, manifest not fully ticked off. */
    batchesArrived: number;
    /** Consignments physically held in Dar, cleared or not. */
    cargoInWarehouse: number;
    /** Held cargo Finance has not cleared: stored, not collectable. */
    cargoAwaitingPayment: number;
    cargoReadyForPickup: number;
    cargoCollectedThisMonth: number;
    /** Past the free storage window, so it is costing the customer money. */
    cargoDelayed: number;
    kgOnFloor: number;
    /** Cases and claims with nobody's ruling on them. */
    openIssues: number;
  };

  finance: {
    /** Billed today. Accrual — what was invoiced, not what arrived. */
    revenueTodayUsd: number;
    /** Cash in today. What customers actually handed over. */
    collectedTodayUsd: number;
    expensesTodayUsd: number;
    expensesThisMonthUsd: number;
    /** Confirmed bills customers still owe. */
    outstandingUsd: number;
    /** Cargo released on a promise, not yet paid for. Never cash. */
    creditOutstandingUsd: number;
    /** Every CASH-kind account, the office tin included. */
    cashUsd: number;
    bankUsd: number;
    mobileMoneyUsd: number;
    /** Revenue less costs, this month, on the accrual basis. */
    profitThisMonthUsd: number;
    marginPct: number | null;
    collectionRatePct: number | null;
  };

  customers: {
    total: number;
    newThisMonth: number;
    /** Customers carrying a live credit balance right now. */
    onCredit: number;
    overdueOnCredit: number;
    /** What customers owe on confirmed bills. Same question as outstanding. */
    outstandingUsd: number;
    /** Tickets where the next move is ours. */
    awaitingReply: number;
    openTickets: number;
    openRequests: number;
  };

  staff: {
    total: number;
    /**
     * Staff who have loaded a page since midnight. THIS IS NOT ATTENDANCE —
     * see the module note. Somebody on the floor all day who never opened the
     * app is absent from this figure, and somebody signed in from a bus is in it.
     */
    seenToday: number;
    byDepartment: { department: Department; label: string; count: number }[];
    /** Accounts suspended: still employees, currently barred from the system. */
    suspended: number;
    /** Active staff with no salary set. A payroll run skips them silently. */
    withoutSalary: number;
    pendingActions: number;
    payroll: {
      label: string;
      status: string;
      netUsd: number;
      headcount: number;
      /** Runs sitting on this desk waiting to be agreed. */
      waiting: number;
      /*
        THE OLDEST WAITING RUN, AND ITS OWN MONEY.

        Separate from the fields above, which describe the NEWEST run whatever
        state it is in. Those two are usually the same run and occasionally are
        not: August paid, July still unsigned. The alarm fired on `waiting` and
        printed the newest run's total beside it, so the manager was shown
        August's figures under a sentence about the run he still has to agree.
        A payroll alarm quoting the wrong month's money is worse than no alarm.
      */
      oldestWaiting: {
        label: string;
        netUsd: number;
        headcount: number;
      } | null;
    } | null;
  };

  management: {
    queues: ApprovalQueue[];
    pendingApprovals: number;
    /** Days the oldest waiting decision, of any kind, has been waiting. */
    oldestApprovalDays: number | null;
    statements: StatementSummary;
    payrollWaiting: number;
    /** Live credit warnings. Rendered as rows in the attention panel elsewhere. */
    alerts: number;
  };

  insights: Insight[];
};

/** What insights() reads. Handed the composed engines, so it runs no query. */
export type InsightSources = {
  locale: Locale;
  rate: number | null;
  fin: FinanceDashboard;
  credit: Awaited<ReturnType<typeof creditOverview>>;
  queues: ApprovalQueue[];
  statements: StatementSummary;
  payroll: ManagerOverview["staff"]["payroll"];
};

const CLOSED_BATCH_STATUSES = ["ARRIVED", "VERIFIED", "CLOSED"];

/**
 * A batch still sitting in Guangzhou: filling, hit its cap, or sealed and
 * waiting for the flight.
 *
 * Narrower than executiveStats().activeBatches on purpose, and named here so
 * the difference is readable instead of buried in a where-clause. That figure
 * answers "how many batches are live anywhere" — OPEN, READY_TO_DEPART,
 * IN_TRANSIT, ARRIVED — so it counts aircraft that have already left China and
 * does not count FULL at all. This one is printed beside "Flights in the air"
 * and "Landed", and reusing the wider count would put the same aircraft under
 * three tiles at once. Two questions, two sets, each stated once.
 */
export const GUANGZHOU_LOADING_STATUSES = [
  "OPEN",
  "FULL",
  "READY_TO_DEPART",
] as const satisfies readonly BatchStatus[];

/**
 * The five sentences worth reading before the numbers.
 *
 * §17: short, true, and comparative — a figure answers "how much", a comparison
 * answers "is that good", and only the second one changes what somebody does
 * this morning.
 *
 * NO PERCENTAGE OFF A ZERO BASE, ever. percentDelta returns undefined when the
 * period before had nothing in it, and every branch below reads that as "there
 * is no comparison to draw" and says something true instead — "+∞%" and "0%"
 * are both lies about the same month.
 *
 * Pure, and given everything it needs. It runs no query of its own so it cannot
 * disagree with the tiles printed underneath it, and it stays cheap enough to
 * live inside the single Promise.all that produced them.
 *
 * Ordered by rank, which is how much the sentence ought to move a decision
 * today: a month running at a loss and unpaid salaries outrank a trend, and a
 * trend outranks a ratio. Capped at five — a briefing of nine points is a
 * document, and a document does not get read before the first meeting.
 */
export function insights(s: InsightSources): Insight[] {
  const { locale, rate, fin, credit, queues, statements, payroll } = s;
  const pl = fin.pl;
  const prior = fin.prior;

  const money = (usd: number) => formatShillings(usd, rate);
  // A sentence with a figure baked into it can never be looked up whole, so the
  // phrase is translated on its own and the number put back around it — the
  // same trick deskPulse and ownerAttention use, and the only way any of this
  // reaches a Chinese reader.
  const pct = (n: number) => `${Math.abs(Math.round(n))}%`;
  const dir = (n: number) => t(locale, n >= 0 ? "up" : "down");

  const revenueDelta = percentDelta(pl.revenue, prior.revenue);
  const costDelta = percentDelta(pl.costs, prior.costs);
  const creditDelta = percentDelta(pl.creditRevenue, prior.creditRevenue);

  const verify = queues.find((q) => q.key === "payments");
  const verifyAge = verify?.oldestDays ?? null;

  const unpaidBatches = fin.batches.filter(
    (b) => CLOSED_BATCH_STATUSES.includes(b.status) && b.outstandingUsd > 0.005
  );
  const unpaidBatchUsd = unpaidBatches.reduce((n, b) => n + b.outstandingUsd, 0);

  const collectionRate = fin.revenue.collectionRate;

  const candidates: (Insight & { when: boolean })[] = [
    {
      when: pl.profit < 0,
      id: "loss",
      tone: "bad",
      rank: 100,
      text: `${t(locale, "The month is running at a loss of")} ${money(Math.abs(pl.profit))}`,
      href: "/app/finance",
    },
    {
      /* Gated on the waiting run existing, not merely on the count, so the
         sentence and the figures beside it are always the same run. */
      when: payroll?.oldestWaiting != null,
      id: "payroll",
      tone: "warn",
      rank: 95,
      text: `${payroll?.oldestWaiting?.label ?? ""} ${t(locale, "payroll is waiting on your approval —")} ${money(payroll?.oldestWaiting?.netUsd ?? 0)} ${t(locale, "for")} ${payroll?.oldestWaiting?.headcount ?? 0} ${t(locale, "people")}`,
      href: "/app/manager/payroll",
    },
    {
      when: statements.waiting > 0 && statements.oldestDays !== null,
      id: "statements",
      tone: (statements.oldestDays ?? 0) >= 7 ? "bad" : "warn",
      rank: 90,
      text: `${statements.waiting} ${t(locale, "closed flight(s) waiting on your signature, the oldest")} ${statements.oldestDays ?? 0} ${t(locale, "days")}`,
      href: "/app/manager/reconciliation",
    },
    {
      /*
        The WAIT, not the count.

        The owner's example sentence names how many payments are queued, and the
        ExecutiveDashboard below already prints that count as an attention row —
        so this says the thing that row cannot: how long the oldest one has sat.
        Two days is the floor, because a payment banked this morning waiting
        until this afternoon is a desk working, not a desk behind.
      */
      when: verifyAge !== null && verifyAge >= 2,
      id: "verify-age",
      tone: (verifyAge ?? 0) >= 5 ? "bad" : "warn",
      rank: 85,
      text: `${t(locale, "A payment has been waiting")} ${verifyAge ?? 0} ${t(locale, "days for Finance to verify it")}`,
      href: "/app/finance/verify",
    },
    {
      when: revenueDelta !== undefined && Math.abs(revenueDelta) >= 1,
      id: "revenue",
      tone: (revenueDelta ?? 0) >= 0 ? "good" : "warn",
      rank: 70,
      text: `${t(locale, "Revenue is")} ${dir(revenueDelta ?? 0)} ${pct(revenueDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance",
    },
    {
      /* Nothing to compare against. Said plainly rather than as a percentage
         of nothing, which is the one number this strip must never print. */
      when: revenueDelta === undefined && pl.revenue > 0,
      id: "revenue-first",
      tone: "neutral",
      rank: 68,
      text: `${t(locale, "First month with takings —")} ${money(pl.revenue)} ${t(locale, "billed so far")}`,
      href: "/app/finance",
    },
    {
      when: costDelta !== undefined && costDelta >= 10,
      id: "costs-up",
      tone: "warn",
      rank: 66,
      text: `${t(locale, "Costs are")} ${dir(costDelta ?? 0)} ${pct(costDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/expenses",
    },
    {
      when: collectionRate !== null && collectionRate < 50,
      id: "collection-low",
      tone: collectionRate !== null && collectionRate < 25 ? "bad" : "warn",
      rank: 64,
      text: `${t(locale, "Customers have paid only")} ${Math.round(collectionRate ?? 0)}% ${t(locale, "of what was billed this month")}`,
      href: "/app/collections/follow-up",
    },
    {
      when: creditDelta !== undefined && Math.abs(creditDelta) >= 5,
      id: "credit",
      tone: (creditDelta ?? 0) >= 0 ? "warn" : "good",
      rank: 60,
      text: `${t(locale, "Cargo released on credit is")} ${dir(creditDelta ?? 0)} ${pct(creditDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/credit",
    },
    {
      when: creditDelta === undefined && pl.creditRevenue > 0,
      id: "credit-first",
      tone: "neutral",
      rank: 58,
      text: `${t(locale, "First month releasing cargo on credit —")} ${money(pl.creditRevenue)}`,
      href: "/app/finance/credit",
    },
    {
      when: unpaidBatches.length > 0,
      id: "batches-unpaid",
      tone: "warn",
      rank: 56,
      text: `${unpaidBatches.length} ${t(locale, "landed batch(es) still carry unpaid balances")} — ${money(unpaidBatchUsd)}`,
      href: "/app/batches",
    },
    {
      when: credit.overdueCount > 0,
      id: "credit-overdue-rate",
      tone: "warn",
      rank: 54,
      text: `${t(locale, "Credit is")} ${Math.round(credit.collectionRate ?? 0)}% ${t(locale, "collected, with")} ${credit.overdueCount} ${t(locale, "credit(s) past their due date")}`,
      href: "/app/finance/credit",
    },
    {
      when: pl.profit > 0,
      id: "profit",
      tone: "good",
      rank: 30,
      text:
        pl.margin === null
          ? `${t(locale, "The month is in profit by")} ${money(pl.profit)}`
          : `${t(locale, "The month is in profit by")} ${money(pl.profit)} · ${Math.round(pl.margin)}% ${t(locale, "margin")}`,
      href: "/app/finance",
    },
    {
      when: costDelta !== undefined && costDelta <= -10,
      id: "costs-down",
      tone: "good",
      rank: 28,
      text: `${t(locale, "Costs are")} ${dir(costDelta ?? 0)} ${pct(costDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/expenses",
    },
  ];

  return candidates
    .filter((row) => row.when)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map(({ when: _when, ...row }) => row);
}

export async function managerOverview(
  locale: Locale = "en",
  now = new Date()
): Promise<ManagerOverview> {
  const window = monthWindow(0, locale);
  const previous = monthWindow(1, locale);
  const today = windowFor("today", locale).window;

  const [
    fin,
    plToday,
    exec,
    dar,
    floor,
    credit,
    support,
    queues,
    statementQueue,
    payrollWaiting,
    latestRuns,
    alerts,
    rate,
    batchesLoading,
    newCustomers,
    roster,
    onPayroll,
    suspended,
  ] = await Promise.all([
    /* The money, the account position and the per-batch performance, from the
       one engine Finance and the owner both read. */
    financeDashboard(window, previous),
    /* Today, on the same engine the month is computed with. A separate "today"
       query would be a second definition of revenue. */
    profitAndLoss(today),
    executiveStats(),
    darStats(),
    floorSnapshot(),
    creditOverview(now),
    supportOverview(),
    approvalQueues(now),
    /* The summary is derived from the rows the queue already returned rather
       than queried again, or the headline could disagree with its own list. */
    submittedStatements(now).then(async (rows) => ({
      rows,
      summary: await statementSummary(rows, now),
    })),
    pendingPayrollApproval(now),
    payrollRuns(1),
    creditAlerts(now),
    currentRateValue(),

    /* Batches still in Guangzhou, on the named set above. Nothing else counts
       them: executiveStats folds the live states into one wider "active"
       figure that already includes flights in the air, and darStats answers
       only for what has left China. */
    prisma.batch.count({
      where: { status: { in: [...GUANGZHOU_LOADING_STATUSES] } },
    }),

    prisma.customer.count({ where: { createdAt: { gte: window.from } } }),

    /* One pass over the roster rather than five counts. Every figure below has
       to describe the same set of people, and five aggregates run against a
       table somebody is editing can return five different companies. */
    prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        department: true,
        lastActiveAt: true,
      },
    }),

    /* Who is actually on the payroll, from the function that decides it. The
       tile underneath is "no salary set", and it is derived by subtraction
       rather than by testing payrollRoster's three conditions a second time —
       see the comment where it is counted. */
    payrollRoster(),

    /* Suspended accounts, counted OUTSIDE the roster above, which is the only
       way this tile can ever be non-zero.

       Both write paths in lib/actions/users.ts move `active` and `status`
       together — createUser sets `active: input.status === "ACTIVE"`, and
       setUserActive writes `{ active, status: active ? "ACTIVE" : "SUSPENDED" }`
       — deliberately, so nobody is barred from signing in by a screen that
       says they are fine. The consequence is that a suspended account always
       carries active=false, so a roster filtered on `active: true` cannot
       contain one, and counting suspensions inside that loop always returned
       zero however many people were barred.

       Not filtered on `active` here for the same reason. INACTIVE is the third
       status and means gone, not barred, so it is not this tile. */
    prisma.user.count({ where: { status: "SUSPENDED" } }),
  ]);

  // ------------------------------------------------------------------- staff
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const departmentCounts = new Map<Department, number>();
  let seenToday = 0;
  for (const person of roster) {
    departmentCounts.set(
      person.department,
      (departmentCounts.get(person.department) ?? 0) + 1
    );
    if (person.lastActiveAt && person.lastActiveAt >= midnight) seenToday += 1;
  }

  /* Everyone the roster shows whom payrollRoster() leaves off — derived, not
     re-tested. payrollRoster owns the rule for who a run is built from (active,
     status ACTIVE, baseSalary set); restating those conditions here would mean
     two definitions of "on the payroll", and the day one of them changes is the
     day somebody is missed by a salary run while this tile still reads zero.
     Subtraction cannot drift from it.

     Both sets are drawn from active accounts, and active and status move
     together (see the suspended count above), so what is left is exactly the
     people nobody has said a salary for.

     It costs a second read of the staff table, so somebody hired between the
     two reads counts here for one refresh. That is the cheaper of the two
     errors: a stale figure corrects itself, a second copy of the payroll rule
     does not. */
  const onPayrollIds = new Set(onPayroll.map((person) => person.id));
  const withoutSalary = roster.filter(
    (person) => !onPayrollIds.has(person.id)
  ).length;

  const latest = latestRuns[0] ?? null;
  const payroll: ManagerOverview["staff"]["payroll"] = latest
    ? {
        label: formatMonthYear(new Date(latest.year, latest.month - 1, 1), locale),
        status: latest.status,
        netUsd: latest.totals.net,
        headcount: latest.totals.headcount,
        waiting: payrollWaiting.length,
        oldestWaiting: payrollWaiting[0]
          ? {
              label: formatMonthYear(
                new Date(payrollWaiting[0].year, payrollWaiting[0].month - 1, 1),
                locale
              ),
              netUsd: payrollWaiting[0].totals.net,
              headcount: payrollWaiting[0].totals.headcount,
            }
          : null,
      }
    : null;

  // ---------------------------------------------------------------- position
  /* Grouped by AccountKind, which is the only split this schema has. There is
     no petty-cash model: the office tin is a CASH account, so it is inside
     `cashUsd` and the label on screen says so. Inventing a petty-cash figure
     would mean inventing the rule that decides which CASH account is petty. */
  /*
    SHILLING ACCOUNTS ARE ADDED AS THEY STAND, and only a dollar account is
    converted — once.

    Summing `balanceUsd` and letting the screen multiply by today's rate double-
    converts every shilling account: the ledger's dollar column was struck at
    the rate in force when each movement posted, so the balance goes out through
    one rate and comes back in through another. The morning a new rate is
    published the total moves and the accounts page it links to does not — a
    headline disagreeing with its own parts, which is the exact bug
    app/app/finance/accounts/page.tsx documents having already fixed there.

    With no rate published there is nothing honest to value a dollar account
    with, so the ledger's frozen dollar figure stands in — the same fallback
    that page uses.
  */
  const heldByKind = (kind: string) =>
    fin.position.accounts
      .filter((account) => account.kind === kind)
      .reduce(
        (sum, account) =>
          sum +
          (rate === null
            ? account.balanceUsd
            : account.currency === "TZS"
              ? account.balance
              : account.balance * rate),
        0
      );

  // ----------------------------------------------------------------- queues
  const oldestApprovalDays = queues.reduce<number | null>(
    (oldest, queue) =>
      queue.oldestDays === null
        ? oldest
        : oldest === null
          ? queue.oldestDays
          : Math.max(oldest, queue.oldestDays),
    null
  );

  const overview: Omit<ManagerOverview, "insights"> = {
    rate,

    operations: {
      batchesLoading,
      batchesInAir: dar.incoming,
      batchesArrived: dar.awaitingCheck,
      /* The floor's own count, which includes cleared cargo still standing
         here. darStats.inWarehouse answers a narrower question (not yet
         cleared) and is reported separately as cargoAwaitingPayment. */
      cargoInWarehouse: floor.shipments,
      cargoAwaitingPayment: floor.unpaid,
      cargoReadyForPickup: dar.readyForPickup,
      cargoCollectedThisMonth: exec.deliveredThisMonth,
      cargoDelayed: floor.aging,
      kgOnFloor: floor.weightKg,
      openIssues: dar.openExceptions,
    },

    finance: {
      revenueTodayUsd: plToday.revenue,
      collectedTodayUsd: plToday.cashIn,
      expensesTodayUsd: plToday.costs,
      expensesThisMonthUsd: fin.pl.costs,
      outstandingUsd: fin.position.receivableUsd,
      creditOutstandingUsd: credit.outstandingUsd,
      cashUsd: heldByKind("CASH"),
      bankUsd: heldByKind("BANK"),
      mobileMoneyUsd: heldByKind("MOBILE_MONEY"),
      profitThisMonthUsd: fin.pl.profit,
      marginPct: fin.pl.margin,
      collectionRatePct: fin.revenue.collectionRate,
    },

    customers: {
      total: exec.customers,
      newThisMonth: newCustomers,
      onCredit: credit.activeAccountCount,
      overdueOnCredit: credit.overdueCount,
      outstandingUsd: fin.position.receivableUsd,
      awaitingReply: support.waitingOnUs,
      openTickets: support.openTickets,
      openRequests: support.openRequests,
    },

    staff: {
      /*
        Counted off the roster rows, not read from executiveStats.staff.

        They ask the same question of the same population — active accounts —
        and normally return the same number, so this is not a second opinion.
        It is the same opinion, counted once: the department split, "seen today"
        and this total are printed together, and a total drawn from a different
        query can disagree with the four figures underneath it by one the moment
        somebody is deactivated between the two reads.
      */
      total: roster.length,
      seenToday,
      byDepartment: [...departmentCounts.entries()]
        .map(([department, count]) => ({
          department,
          label: DEPARTMENT_LABELS[department],
          count,
        }))
        .sort((a, b) => b.count - a.count),
      suspended,
      withoutSalary,
      pendingActions: suspended + withoutSalary,
      payroll,
    },

    management: {
      queues,
      pendingApprovals: queues.reduce((sum, queue) => sum + queue.count, 0),
      oldestApprovalDays,
      statements: statementQueue.summary,
      payrollWaiting: payrollWaiting.length,
      alerts: alerts.length,
    },
  };

  return {
    ...overview,
    insights: insights({
      locale,
      rate,
      fin,
      credit,
      queues,
      statements: statementQueue.summary,
      payroll,
    }),
  };
}
