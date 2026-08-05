import "server-only";

import { toNumber } from "@/lib/format";
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

export function monthWindow(offset = 0): ProfitWindow {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  return {
    from,
    to,
    label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

export function yearWindow(): ProfitWindow {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now.getFullYear() + 1, 0, 1);
  return { from, to, label: String(now.getFullYear()) };
}

export async function profitAndLoss(window: ProfitWindow) {
  const range = { gte: window.from, lt: window.to };

  const [billed, collected, incurred, paidOut, byCategory] = await Promise.all([
    // Accrual revenue: bills raised in the window that Finance has confirmed.
    prisma.invoice.aggregate({
      where: { issuedAt: range, status: { notIn: ["DRAFT", "VOID"] } },
      _sum: { total: true },
      _count: true,
    }),
    // Cash in: what customers actually handed over, restated in the invoice's
    // currency so it can be summed at all.
    prisma.payment.aggregate({
      where: { paidAt: range },
      _sum: { creditedAmount: true },
    }),
    // Accrual costs: dated when the cost was incurred, which is what puts a
    // flight's customs bill in the month it flew rather than the month it was
    // settled.
    prisma.expense.aggregate({
      where: { incurredAt: range, status: { not: "VOID" } },
      _sum: { amountUsd: true },
    }),
    // Cash out: money that actually left an account.
    prisma.expense.aggregate({
      where: { paidAt: range, status: "PAID" },
      _sum: { amountUsd: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: range, status: { not: "VOID" } },
      _sum: { amountUsd: true },
      orderBy: { _sum: { amountUsd: "desc" } },
    }),
  ]);

  const revenue = toNumber(billed._sum.total);
  const costs = toNumber(incurred._sum.amountUsd);
  const cashIn = toNumber(collected._sum.creditedAmount);
  const cashOut = toNumber(paidOut._sum.amountUsd);

  return {
    window,
    invoices: billed._count,
    revenue,
    costs,
    profit: revenue - costs,
    // Guarded: a month with no revenue has no margin, not an infinite one.
    margin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    categories: byCategory.map((row) => ({
      category: row.category,
      amount: toNumber(row._sum.amountUsd),
    })),
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
        select: {
          invoice: { select: { total: true, status: true } },
        },
      },
      expenses: {
        where: { status: { not: "VOID" } },
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

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      departedAt: batch.departedAt,
      revenue,
      costs,
      profit: revenue - costs,
      // Shown, not hidden: a flight whose prices are still drafts has a revenue
      // figure that will move, and the page must not present it as final.
      unconfirmed: drafts,
      hasCosts: batch.expenses.length > 0,
    };
  });
}
