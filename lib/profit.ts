import "server-only";

import { formatMonthYear, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/**
 * Profit, and the two honest ways to count it.
 *
 * ACCRUAL asks "did this month's work make money" — revenue from the bills
 * raised in it, costs from the day they were incurred. It is the figure that
 * tells you whether the business works.
 *
 * CASH asks "did more money come in than went out" — payments received, costs
 * actually paid. It is the figure that tells you whether you can make payroll.
 *
 * They disagree, always, and both are correct. Every profit page in this system
 * shows both and says which is which, because a single "profit" number with no
 * stated basis is the thing that gets argued about at the worst possible moment.
 *
 * DRAFT invoices are excluded everywhere: a price Finance has not confirmed is
 * a working figure, not revenue.
 */
export type ProfitWindow = {
  from: Date;
  to: Date;
  label: string;
};

export function monthWindow(offset = 0, locale: Locale = "en"): ProfitWindow {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  return {
    from,
    to,
    // The period's name sits under the profit figure on the P&L, so it is the
    // one label on that page that is a date rather than a phrase — and the
    // reason a Chinese screen still said "August 2026".
    label: formatMonthYear(from, locale),
  };
}

export function yearWindow(locale: Locale = "en"): ProfitWindow {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now.getFullYear() + 1, 0, 1);
  // A bare year is the same four digits either way; Chinese marks it as a year.
  const label = locale === "zh" ? `${now.getFullYear()}年` : String(now.getFullYear());
  return { from, to, label };
}


/**
 * Every period the finance screens offer, and the one before it.
 *
 * The owner asked to read today, this week, this month, this quarter, this
 * year or a range he types himself — and to see each against what came before,
 * because a number without its predecessor answers "how much" but never "is
 * that good". So a window is always a pair.
 *
 * One helper rather than a constructor per period, because the P&L hero, the
 * comparison cards, the table underneath and the CSV download must all be
 * looking at the same stretch of time. They were not: the period chip moved
 * the hero card while the table below it silently showed all time.
 *
 * Calendar boundaries throughout — weeks from Monday, quarters from January,
 * April, July, October — because those are the boundaries the office closes
 * its books on and the ones the boss asks about.
 */
export type PeriodKey =
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";

export function windowFor(
  key: PeriodKey | string | undefined,
  locale: Locale = "en",
  custom?: { from: Date | null; to: Date | null }
): { window: ProfitWindow; previous: ProfitWindow; key: PeriodKey } {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 86_400_000;
  const span = (from: Date, to: Date, label: string): ProfitWindow => ({ from, to, label });

  /* A range somebody typed. Its predecessor is the same number of days
     immediately before it, which is the only honest comparison for an
     arbitrary stretch. */
  if (key === "custom" && custom?.from) {
    const from = custom.from;
    const to = custom.to ?? new Date(midnight.getTime() + day);
    const width = Math.max(day, to.getTime() - from.getTime());
    return {
      key: "custom",
      window: span(from, to, "the range you chose"),
      previous: span(new Date(from.getTime() - width), from, "the stretch before"),
    };
  }

  if (key === "today") {
    const to = new Date(midnight.getTime() + day);
    return {
      key: "today",
      window: span(midnight, to, "today"),
      previous: span(new Date(midnight.getTime() - day), midnight, "yesterday"),
    };
  }

  if (key === "week") {
    /* Monday-first: Sunday is 0, so it counts back six days, not none. */
    const back = (midnight.getDay() + 6) % 7;
    const from = new Date(midnight.getTime() - back * day);
    return {
      key: "week",
      window: span(from, new Date(midnight.getTime() + day), "this week"),
      previous: span(new Date(from.getTime() - 7 * day), from, "last week"),
    };
  }

  if (key === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 1);
    const prevFrom = new Date(now.getFullYear(), q * 3 - 3, 1);
    return {
      key: "quarter",
      window: span(from, to, `Q${q + 1} ${now.getFullYear()}`),
      previous: span(prevFrom, from, "the quarter before"),
    };
  }

  if (key === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    return {
      key: "year",
      window: yearWindow(locale),
      previous: span(
        new Date(now.getFullYear() - 1, 0, 1),
        from,
        String(now.getFullYear() - 1)
      ),
    };
  }

  return {
    key: "month",
    window: monthWindow(0, locale),
    previous: monthWindow(1, locale),
  };
}

export async function profitAndLoss(window: ProfitWindow) {
  const range = { gte: window.from, lt: window.to };

  const [billed, collected, incurred, paidOut, byCategory, special, transferFees] =
    await Promise.all([
    // Accrual revenue: bills raised in the window that Finance has confirmed.
    prisma.invoice.aggregate({
      where: { issuedAt: range, status: { notIn: ["DRAFT", "VOID"] } },
      _sum: { total: true },
      _count: true,
    }),
    /*
      Cash in: what customers actually handed over, restated in the invoice's
      currency so it can be summed at all.

      creditedAmount is nullable — it is only written when the customer paid in
      a currency the invoice was not denominated in. Summing it alone therefore
      dropped every payment made in the invoice's own currency, which is most
      of them, and made this figure quietly smaller than the same figure on
      three other screens. The rest of the codebase already reads
      COALESCE(creditedAmount, amount); this now agrees with it.
    */
    prisma.payment.findMany({
      where: { paidAt: range },
      select: { creditedAmount: true, amount: true },
    }),
    // Accrual costs: dated when the cost was incurred, which is what puts a
    // flight's customs bill in the month it flew rather than the month it was
    // settled.
    prisma.expense.aggregate({
      where: {
        incurredAt: range,
        status: { not: "VOID" },
        expenseClass: "OPERATING",
      },
      _sum: { amountUsd: true },
    }),
    // Cash out: money that actually left an account — ALL of it, including the
    // special class. Profit and cash answer different questions: a
    // non-operating payment does not belong in the margin, but it absolutely
    // left the bank, and a cash figure that pretends otherwise will not
    // reconcile against a statement.
    prisma.expense.aggregate({
      where: { paidAt: range, status: "PAID" },
      _sum: { amountUsd: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: {
        incurredAt: range,
        status: { not: "VOID" },
        expenseClass: "OPERATING",
      },
      _sum: { amountUsd: true },
      orderBy: { _sum: { amountUsd: "desc" } },
    }),
    // Recorded, shown on its own line, and kept out of the margin.
    prisma.expense.aggregate({
      where: {
        incurredAt: range,
        status: { not: "VOID" },
        expenseClass: "NON_OPERATING",
      },
      _sum: { amountUsd: true },
      _count: true,
    }),
    // Bank charges on our own transfers.
    //
    // These are a genuine cost that never passes through the expense table:
    // the fee is taken out of the movement itself, so the cash balances are
    // already right and nothing is missing from the ledger. But a cost that
    // reduces cash and appears in no cost line overstates profit by exactly
    // its own size, every single time — small per transfer and relentless
    // over a year. Counted here rather than left out.
    prisma.accountTransfer.aggregate({
      where: { occurredAt: range, fee: { gt: 0 } },
      _sum: { fee: true },
      _count: true,
    }),
  ]);

  const revenue = toNumber(billed._sum.total);
  const cashIn = collected.reduce(
    (sum, payment) =>
      sum + toNumber(payment.creditedAmount ?? payment.amount),
    0
  );

  // Fees are recorded in the source account's currency, which for every
  // account but one is shillings. Valued at the rate on the day would be more
  // precise; at this size the published rate is close enough, and a fee that
  // cannot be valued at all would simply be dropped — which is the failure
  // this exists to prevent.
  const rate = await currentRateValue();
  const feeLocal = toNumber(transferFees._sum.fee);
  const feeUsd = rate ? Math.round((feeLocal / rate) * 100) / 100 : 0;

  const costs = toNumber(incurred._sum.amountUsd) + feeUsd;
  const cashOut = toNumber(paidOut._sum.amountUsd) + feeUsd;

  const specialUsd = toNumber(special._sum.amountUsd);

  return {
    window,
    invoices: billed._count,
    revenue,
    costs,
    profit: revenue - costs,
    /*
      Money that left the company without belonging in the margin.

      Reported next to profit rather than buried, because the reader needs both
      numbers to make sense of the bank balance: profit says how the business
      did, and this says what else went out. Adding it to costs would answer
      neither question honestly.
    */
    specialCosts: specialUsd,
    specialCount: special._count,
    profitAfterSpecial: revenue - costs - specialUsd,
    // Guarded: a month with no revenue has no margin, not an infinite one.
    margin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    bankCharges: feeUsd,
    categories: [
      ...byCategory.map((row) => ({
        category: row.category,
        amount: toNumber(row._sum.amountUsd),
      })),
      ...(feeUsd > 0
        ? [{ category: "BANK_CHARGES", amount: feeUsd }]
        : []),
    ].sort((a, b) => b.amount - a.amount),
  };
}

/**
 * Profit per flight.
 *
 * Revenue per dispatch was always derivable. What was missing was the other
 * half — and Expense.batchId is the single field that supplies it. A cost not
 * tied to a flight is simply not counted here, and the page says how much that
 * is rather than silently spreading it around.
 */
export async function profitByDispatch(take = 10) {
  const batches = await prisma.batch.findMany({
    where: { status: { in: ["IN_TRANSIT", "ARRIVED", "VERIFIED", "CLOSED"] } },
    orderBy: [{ departedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      departedAt: true,
      shipments: {
        // Cargo that was deleted is not on the flight, and counting its invoice
        // would inflate the flight's revenue with money nobody will ever pay.
        where: { deletedAt: null },
        select: {
          invoice: { select: { total: true, status: true, amountPaid: true } },
        },
      },
      expenses: {
        // Operating only. A special cost is real money and appears in the cash
        // figures, but charging it to a flight would make that flight look
        // unprofitable for a reason that has nothing to do with the flight.
        where: { status: { not: "VOID" }, expenseClass: "OPERATING" },
        select: { amountUsd: true },
      },
    },
  });

  return batches.map((batch) => {
    const revenue = batch.shipments.reduce((sum, shipment) => {
      const invoice = shipment.invoice;
      if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID") {
        return sum;
      }
      return sum + toNumber(invoice.total);
    }, 0);
    const drafts = batch.shipments.filter(
      (s) => s.invoice?.status === "DRAFT"
    ).length;
    const costs = batch.expenses.reduce(
      (sum, expense) => sum + toNumber(expense.amountUsd),
      0
    );

    const collected = batch.shipments.reduce((sum, shipment) => {
      const invoice = shipment.invoice;
      if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID") {
        return sum;
      }
      return sum + toNumber(invoice.amountPaid);
    }, 0);

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      departedAt: batch.departedAt,
      revenue,
      collected,
      outstanding: Math.max(0, revenue - collected),
      costs,
      profit: revenue - costs,
      // Guarded: a flight that has billed nothing has no margin, not an
      // infinite one and not a division by zero.
      margin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null,
      // Shown, not hidden: a flight whose prices are still drafts has a revenue
      // figure that will move, and the page must not present it as final.
      unconfirmed: drafts,
      hasCosts: batch.expenses.length > 0,
    };
  });
}
