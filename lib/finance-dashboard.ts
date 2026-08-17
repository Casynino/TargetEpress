import "server-only";

import { toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { profitAndLoss, type ProfitWindow } from "@/lib/profit";

/**
 * Everything the Profit & loss page shows, computed once.
 *
 * The owner's instruction, in his words: do not create separate duplicated
 * financial calculations, and Admin must see exactly what Finance sees. So this
 * is the single object both read. It composes the existing engines rather than
 * re-aggregating anything they already answer — profitAndLoss for the period
 * money, accountBalances for the cash position — and only adds the questions
 * nothing computed yet: volume, per-batch performance, the collection picture,
 * the month-by-month trend and the ratios.
 *
 * Two honesty rules run through it, and they are load-bearing:
 *
 * Revenue here is FREIGHT revenue. An invoice cannot exist without a shipment
 * in this schema, so there is no other kind, and calling it plain "revenue"
 * would imply a category of income the system cannot record.
 *
 * "Office" costs are costs with no batch against them. That is a proxy, not a
 * field — the schema has no office/batch flag — and a flight cost nobody
 * tagged looks identical to real overhead. The split is shown because Finance
 * needs it, and labelled for what it actually is.
 */
export type BatchPerformance = {
  id: string;
  batchNumber: string;
  origin: string;
  status: string;
  arrivedAt: Date | null;
  cargo: number;
  kg: number;
  expectedUsd: number;
  collectedUsd: number;
  outstandingUsd: number;
  expensesUsd: number;
  profitUsd: number;
  marginPct: number | null;
};

export type FinanceDashboard = {
  window: ProfitWindow;
  previous: ProfitWindow;

  /** The period money, from the one engine that computes it. */
  pl: Awaited<ReturnType<typeof profitAndLoss>>;
  prior: Awaited<ReturnType<typeof profitAndLoss>>;

  volume: {
    kgReceived: number;
    kgBilled: number;
    kgCollected: number;
    packages: number;
    customers: number;
    batchesArrived: number;
    batchesClosed: number;
  };

  revenue: {
    expectedUsd: number;
    collectedUsd: number;
    outstandingUsd: number;
    collectionRate: number | null;
    byOrigin: { origin: string; expectedUsd: number; collectedUsd: number }[];
    topCustomers: { name: string; expectedUsd: number; outstandingUsd: number }[];
  };

  expenses: {
    totalUsd: number;
    batchUsd: number;
    officeUsd: number;
    specialUsd: number;
    byCategory: { category: string; amount: number; share: number }[];
    byBatch: { batchNumber: string; amount: number }[];
  };

  position: {
    accounts: {
      name: string;
      kind: string;
      currency: string;
      balance: number;
      balanceUsd: number;
    }[];
    cashUsd: number;
    receivableUsd: number;
    payableUsd: number;
    netUsd: number;
  };

  collections: {
    expectedUsd: number;
    collectedUsd: number;
    outstandingUsd: number;
    rate: number | null;
    paid: number;
    unpaid: number;
    partiallyPaid: number;
    awaitingVerification: number;
  };

  batches: BatchPerformance[];

  /** Twelve months of the four figures a trend chart needs. */
  trend: {
    labels: string[];
    revenue: number[];
    expenses: number[];
    profit: number[];
    kg: number[];
    collected: number[];
  };

  health: {
    key: string;
    label: string;
    value: string;
    explain: string;
    tone: "good" | "warn" | "bad" | "flat";
  }[];
};

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export async function financeDashboard(
  window: ProfitWindow,
  previous: ProfitWindow,
  filters: { batchId?: string | null; origin?: string | null } = {}
): Promise<FinanceDashboard> {
  const range = { gte: window.from, lt: window.to };
  const batchWhere = filters.batchId ? { id: filters.batchId } : {};
  const originWhere = filters.origin ? { origin: filters.origin as never } : {};

  /* Cargo that landed in the window, which is what every volume figure counts. */
  const arrivedWhere = {
    arrivedAt: range,
    ...(filters.origin ? { origin: filters.origin as never } : {}),
    ...(filters.batchId ? { batchId: filters.batchId } : {}),
  };

  const [
    pl,
    prior,
    landed,
    invoicesInWindow,
    payments,
    expenses,
    balances,
    accountList,
    receivable,
    payable,
    invoiceCounts,
    pendingClaims,
    batchRows,
    monthly,
  ] = await Promise.all([
    profitAndLoss(window),
    profitAndLoss(previous),

    prisma.shipment.findMany({
      where: arrivedWhere,
      select: {
        weightKg: true,
        customerId: true,
        _count: { select: { packageList: true } },
        invoice: { select: { total: true, amountPaid: true, status: true } },
      },
    }),

    prisma.invoice.findMany({
      where: {
        issuedAt: range,
        status: { notIn: ["DRAFT", "VOID"] },
        ...(filters.batchId || filters.origin
          ? { shipment: { ...originWhere, ...(filters.batchId ? { batchId: filters.batchId } : {}) } }
          : {}),
      },
      select: {
        total: true,
        amountPaid: true,
        customer: { select: { name: true } },
        shipment: { select: { origin: true, weightKg: true } },
      },
    }),

    prisma.payment.findMany({
      /* Cancelled payments are not collections. */
      where: { paidAt: range, voidedAt: null },
      select: { amount: true, creditedAmount: true },
    }),

    prisma.expense.findMany({
      where: { incurredAt: range, status: { not: "VOID" } },
      select: {
        amountUsd: true,
        category: true,
        expenseClass: true,
        batch: { select: { batchNumber: true } },
      },
    }),

    accountBalances(prisma),
    /* The ledger answers balances by account id; the names live here. */
    prisma.companyAccount.findMany({
      select: { id: true, name: true, kind: true, currency: true, active: true },
    }),

    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _sum: { total: true, amountPaid: true },
    }),

    /* Costs recorded and not yet disbursed — the only payable this schema has. */
    prisma.expense.aggregate({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amountUsd: true },
    }),

    prisma.invoice.groupBy({
      by: ["status"],
      _count: true,
      where: { status: { notIn: ["DRAFT", "VOID"] } },
    }),

    prisma.paymentSubmission
      .count({ where: { status: "PENDING" } })
      .catch(() => 0),

    prisma.batch.findMany({
      where: { permanent: false, ...batchWhere, ...originWhere },
      orderBy: [{ arrivalDate: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        batchNumber: true,
        origin: true,
        status: true,
        arrivalDate: true,
        shipments: {
          select: {
            weightKg: true,
            invoice: { select: { total: true, amountPaid: true } },
          },
        },
        expenses: {
          where: { status: { not: "VOID" }, expenseClass: { not: "NON_OPERATING" } },
          select: { amountUsd: true },
        },
      },
    }),

    /*
      Twelve months of trend, in one pass over the year rather than twelve
      round trips. Invoices and expenses are read by their own dates —
      issuedAt and incurredAt — so a month shows the work that happened in it.
    */
    Promise.all([
      prisma.invoice.findMany({
        where: {
          issuedAt: { gte: new Date(window.to.getFullYear() - 1, window.to.getMonth(), 1) },
          status: { notIn: ["DRAFT", "VOID"] },
        },
        select: { issuedAt: true, total: true, shipment: { select: { weightKg: true } } },
      }),
      prisma.expense.findMany({
        where: {
          incurredAt: { gte: new Date(window.to.getFullYear() - 1, window.to.getMonth(), 1) },
          status: { not: "VOID" },
          expenseClass: { not: "NON_OPERATING" },
        },
        select: { incurredAt: true, amountUsd: true },
      }),
      prisma.payment.findMany({
        where: {
          paidAt: { gte: new Date(window.to.getFullYear() - 1, window.to.getMonth(), 1) },
          /* The twelve-month trend excludes cancelled payments too, or a
             correction made today would leave a phantom spike in a past month
             that no other screen agrees with. */
          voidedAt: null,
        },
        select: { paidAt: true, amount: true, creditedAmount: true },
      }),
    ]),
  ]);

  // ------------------------------------------------------------------ volume
  const kgReceived = landed.reduce((n, s) => n + toNumber(s.weightKg), 0);
  const kgBilled = invoicesInWindow.reduce(
    (n, i) => n + toNumber(i.shipment?.weightKg ?? 0),
    0
  );
  const kgCollected = landed.reduce(
    (n, s) =>
      n + (s.invoice && toNumber(s.invoice.amountPaid) >= toNumber(s.invoice.total)
        ? toNumber(s.weightKg)
        : 0),
    0
  );

  // ----------------------------------------------------------------- revenue
  const expectedUsd = invoicesInWindow.reduce((n, i) => n + toNumber(i.total), 0);
  const paidOnThose = invoicesInWindow.reduce((n, i) => n + toNumber(i.amountPaid), 0);
  const byOriginMap = new Map<string, { expectedUsd: number; collectedUsd: number }>();
  for (const inv of invoicesInWindow) {
    const key = inv.shipment?.origin ?? "—";
    const cell = byOriginMap.get(key) ?? { expectedUsd: 0, collectedUsd: 0 };
    cell.expectedUsd += toNumber(inv.total);
    cell.collectedUsd += toNumber(inv.amountPaid);
    byOriginMap.set(key, cell);
  }
  const customerMap = new Map<string, { expectedUsd: number; outstandingUsd: number }>();
  for (const inv of invoicesInWindow) {
    const key = inv.customer?.name ?? "—";
    const cell = customerMap.get(key) ?? { expectedUsd: 0, outstandingUsd: 0 };
    cell.expectedUsd += toNumber(inv.total);
    cell.outstandingUsd += Math.max(0, toNumber(inv.total) - toNumber(inv.amountPaid));
    customerMap.set(key, cell);
  }

  // ---------------------------------------------------------------- expenses
  let batchUsd = 0;
  let officeUsd = 0;
  let specialUsd = 0;
  const categoryMap = new Map<string, number>();
  const expenseBatchMap = new Map<string, number>();
  for (const e of expenses) {
    const usd = toNumber(e.amountUsd);
    if (e.expenseClass === "NON_OPERATING") {
      specialUsd += usd;
      continue;
    }
    if (e.batch) {
      batchUsd += usd;
      expenseBatchMap.set(
        e.batch.batchNumber,
        (expenseBatchMap.get(e.batch.batchNumber) ?? 0) + usd
      );
    } else {
      officeUsd += usd;
    }
    categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + usd);
  }
  const operatingTotal = batchUsd + officeUsd;

  // ---------------------------------------------------------------- position
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const accounts = balances
    .map((row) => {
      const meta = accountById.get(row.accountId);
      return {
        name: meta?.name ?? "—",
        kind: meta?.kind ?? "—",
        currency: meta?.currency ?? "USD",
        balance: toNumber(row.inflow) - toNumber(row.outflow),
        balanceUsd: toNumber(row.inflowUsd) - toNumber(row.outflowUsd),
      };
    })
    .sort((a, b) => b.balanceUsd - a.balanceUsd);
  /* Cash is the ledger's own answer, in dollars so accounts of two currencies
     can be added at all. Nothing stores it. */
  const cashUsd = accounts.reduce((n, a) => n + a.balanceUsd, 0);
  const receivableUsd =
    toNumber(receivable._sum.total) - toNumber(receivable._sum.amountPaid);
  const payableUsd = toNumber(payable._sum.amountUsd);

  // ------------------------------------------------------------- collections
  const counts = Object.fromEntries(
    invoiceCounts.map((row) => [row.status, row._count])
  ) as Record<string, number>;
  const collectedAll = payments.reduce(
    (n, p) => n + toNumber(p.creditedAmount ?? p.amount),
    0
  );

  // ----------------------------------------------------------------- batches
  const batches: BatchPerformance[] = batchRows.map((batch) => {
    const expected = batch.shipments.reduce(
      (n, s) => n + toNumber(s.invoice?.total ?? 0),
      0
    );
    const collected = batch.shipments.reduce(
      (n, s) => n + toNumber(s.invoice?.amountPaid ?? 0),
      0
    );
    const spent = batch.expenses.reduce((n, e) => n + toNumber(e.amountUsd), 0);
    const profit = expected - spent;
    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      origin: batch.origin,
      status: batch.status,
      arrivedAt: batch.arrivalDate,
      cargo: batch.shipments.length,
      kg: batch.shipments.reduce((n, s) => n + toNumber(s.weightKg), 0),
      expectedUsd: expected,
      collectedUsd: collected,
      outstandingUsd: Math.max(0, expected - collected),
      expensesUsd: spent,
      profitUsd: profit,
      marginPct: pct(profit, expected),
    };
  });

  // ------------------------------------------------------------------- trend
  const [trendInvoices, trendExpenses, trendPayments] = monthly;
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(window.to.getFullYear(), window.to.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
    });
  }
  const bucket = () => new Map(months.map((m) => [m.key, 0]));
  const revenueBy = bucket();
  const expenseBy = bucket();
  const kgBy = bucket();
  const collectedBy = bucket();
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  for (const inv of trendInvoices) {
    const k = keyOf(inv.issuedAt);
    if (revenueBy.has(k)) {
      revenueBy.set(k, revenueBy.get(k)! + toNumber(inv.total));
      kgBy.set(k, kgBy.get(k)! + toNumber(inv.shipment?.weightKg ?? 0));
    }
  }
  for (const e of trendExpenses) {
    const k = keyOf(e.incurredAt);
    if (expenseBy.has(k)) expenseBy.set(k, expenseBy.get(k)! + toNumber(e.amountUsd));
  }
  for (const p of trendPayments) {
    const k = keyOf(p.paidAt);
    if (collectedBy.has(k))
      collectedBy.set(k, collectedBy.get(k)! + toNumber(p.creditedAmount ?? p.amount));
  }

  const revenueSeries = months.map((m) => revenueBy.get(m.key)!);
  const expenseSeries = months.map((m) => expenseBy.get(m.key)!);

  // ------------------------------------------------------------------ health
  const collectionRate = pct(paidOnThose, expectedUsd);
  const expenseRatio = pct(pl.costs, pl.revenue);
  const outstandingRatio = pct(receivableUsd, receivableUsd + collectedAll);
  const revenueGrowth =
    prior.revenue > 0
      ? Math.round(((pl.revenue - prior.revenue) / prior.revenue) * 1000) / 10
      : null;
  const profitGrowth =
    prior.profit !== 0
      ? Math.round(((pl.profit - prior.profit) / Math.abs(prior.profit)) * 1000) / 10
      : null;

  const health: FinanceDashboard["health"] = [
    {
      key: "collection",
      label: "Collection rate",
      value: collectionRate === null ? "—" : `${collectionRate}%`,
      explain:
        collectionRate === null
          ? "Nothing was billed in this period, so there is no rate to work out."
          : `${collectionRate}% of what was billed in this period has actually been paid.`,
      tone: collectionRate === null ? "flat" : collectionRate >= 80 ? "good" : collectionRate >= 50 ? "warn" : "bad",
    },
    {
      key: "margin",
      label: "Profit margin",
      value: pl.margin === null ? "—" : `${pl.margin.toFixed(1)}%`,
      explain:
        pl.margin === null
          ? "Nothing was billed, so there is no margin."
          : `USD ${(pl.margin / 100).toFixed(2)} of every USD 1.00 billed is left after the costs of this period.`,
      tone: pl.margin === null ? "flat" : pl.margin >= 30 ? "good" : pl.margin >= 0 ? "warn" : "bad",
    },
    {
      key: "expense",
      label: "Expense ratio",
      value: expenseRatio === null ? "—" : `${expenseRatio}%`,
      explain:
        expenseRatio === null
          ? "Nothing was billed, so costs cannot be measured against it."
          : `${expenseRatio}% of what was billed went back out as costs.`,
      tone: expenseRatio === null ? "flat" : expenseRatio <= 70 ? "good" : expenseRatio <= 100 ? "warn" : "bad",
    },
    {
      key: "outstanding",
      label: "Outstanding ratio",
      value: outstandingRatio === null ? "—" : `${outstandingRatio}%`,
      explain:
        outstandingRatio === null
          ? "Nothing is owed and nothing has been collected."
          : `${outstandingRatio}% of everything billed is still sitting with customers.`,
      tone: outstandingRatio === null ? "flat" : outstandingRatio <= 20 ? "good" : outstandingRatio <= 50 ? "warn" : "bad",
    },
    {
      key: "revenue-growth",
      label: "Revenue growth",
      value: revenueGrowth === null ? "—" : `${revenueGrowth > 0 ? "+" : ""}${revenueGrowth}%`,
      explain:
        revenueGrowth === null
          ? `Nothing was billed in ${previous.label}, so there is nothing to grow from.`
          : `Billed ${revenueGrowth > 0 ? "more" : "less"} than in ${previous.label}.`,
      tone: revenueGrowth === null ? "flat" : revenueGrowth >= 0 ? "good" : "bad",
    },
    {
      key: "profit-growth",
      label: "Profit growth",
      value: profitGrowth === null ? "—" : `${profitGrowth > 0 ? "+" : ""}${profitGrowth}%`,
      explain:
        profitGrowth === null
          ? `${previous.label} made nothing, so there is nothing to compare against.`
          : `Profit is ${profitGrowth > 0 ? "up" : "down"} on ${previous.label}.`,
      tone: profitGrowth === null ? "flat" : profitGrowth >= 0 ? "good" : "bad",
    },
  ];

  return {
    window,
    previous,
    pl,
    prior,
    volume: {
      kgReceived,
      kgBilled,
      kgCollected,
      packages: landed.reduce((n, s) => n + s._count.packageList, 0),
      customers: new Set(landed.map((s) => s.customerId)).size,
      batchesArrived: batchRows.filter(
        (b) => b.arrivalDate && b.arrivalDate >= window.from && b.arrivalDate < window.to
      ).length,
      batchesClosed: batchRows.filter((b) => b.status === "CLOSED").length,
    },
    revenue: {
      expectedUsd,
      collectedUsd: paidOnThose,
      outstandingUsd: Math.max(0, expectedUsd - paidOnThose),
      collectionRate,
      byOrigin: [...byOriginMap.entries()]
        .map(([origin, v]) => ({ origin, ...v }))
        .sort((a, b) => b.expectedUsd - a.expectedUsd),
      topCustomers: [...customerMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.expectedUsd - a.expectedUsd)
        .slice(0, 8),
    },
    expenses: {
      totalUsd: operatingTotal + specialUsd,
      batchUsd,
      officeUsd,
      specialUsd,
      byCategory: [...categoryMap.entries()]
        .map(([category, amount]) => ({
          category,
          amount,
          share: operatingTotal > 0 ? (amount / operatingTotal) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      byBatch: [...expenseBatchMap.entries()]
        .map(([batchNumber, amount]) => ({ batchNumber, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8),
    },
    position: {
      accounts,
      cashUsd,
      receivableUsd,
      payableUsd,
      netUsd: cashUsd + receivableUsd - payableUsd,
    },
    collections: {
      expectedUsd,
      collectedUsd: paidOnThose,
      outstandingUsd: Math.max(0, expectedUsd - paidOnThose),
      rate: collectionRate,
      paid: counts.PAID ?? 0,
      unpaid: counts.UNPAID ?? 0,
      partiallyPaid: counts.PARTIALLY_PAID ?? 0,
      awaitingVerification: pendingClaims,
    },
    batches,
    trend: {
      labels: months.map((m) => m.label),
      revenue: revenueSeries,
      expenses: expenseSeries,
      profit: revenueSeries.map((r, i) => r - expenseSeries[i]),
      kg: months.map((m) => kgBy.get(m.key)!),
      collected: months.map((m) => collectedBy.get(m.key)!),
    },
    health,
  };
}
