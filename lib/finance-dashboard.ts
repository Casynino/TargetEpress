import "server-only";

import type { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { currentRateValue } from "@/lib/fx";
import { accountBalances } from "@/lib/ledger";
import {
  LOCAL_CURRENCY,
  sumShillings,
  sumUsd,
  type MoneyRow,
} from "@/lib/money-totals";
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
  /* The same figures added up as shillings, not converted from the dollars
     beside them. A cost of TSh 20,000 is stored as USD 7.41, and 7.41 x 2,700
     is 20,007 — see lib/money-totals.ts. */
  expectedLocal: number;
  collectedLocal: number;
  outstandingLocal: number;
  expensesLocal: number;
  profitLocal: number;
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
    totalLocal: number;
    batchLocal: number;
    officeLocal: number;
    specialLocal: number;
    byCategory: {
      category: string;
      amount: number;
      amountLocal: number;
      share: number;
    }[];
    byBatch: { batchNumber: string; amount: number; amountLocal: number }[];
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

  /* The trend's floor: the same month a year before the one the window ends
     in. One month more than the twelve buckets need, which the bucket guard
     below simply ignores. */
  const trendStart = new Date(
    window.to.getFullYear() - 1,
    window.to.getMonth(),
    1
  );

  const [
    pl,
    prior,
    landed,
    invoicesInWindow,
    collectedAllTime,
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
        /* WRITTEN_OFF is debt the company formally abandoned; keeping it in
           "billed" and "still owed" reported money nobody will ever chase, and
           disagreed with pl.revenue in this same return value, which already
           excluded it. One dashboard, one answer. */
        status: { notIn: ["DRAFT", "VOID", "WRITTEN_OFF"] },
        ...(filters.batchId || filters.origin
          ? { shipment: { ...originWhere, ...(filters.batchId ? { batchId: filters.batchId } : {}) } }
          : {}),
      },
      select: {
        total: true,
        amountPaid: true,
        amountAdjusted: true,
        customer: { select: { name: true } },
        shipment: { select: { origin: true, weightKg: true } },
      },
    }),

    /* All-time collections, as one figure. It feeds the outstanding ratio,
       whose other side — the receivable — carries no window either: mixing an
       all-time receivable with one period's collections made the ratio move
       with the filter dates while the debt stood still. Cancelled payments are
       not collections, and COALESCE(creditedAmount, amount) is the same
       money-sum discipline every payment total in this app uses — aggregate
       cannot express it, so the database sums it directly. */
    prisma.$queryRaw<{ collected: Prisma.Decimal | null }[]>`
      SELECT SUM(COALESCE("creditedAmount", "amount")) AS "collected"
      FROM "Payment"
      WHERE "voidedAt" IS NULL
    `,

    prisma.expense.findMany({
      where: { incurredAt: range, status: { not: "VOID" } },
      select: {
        /* The native figure and its currency, not just the dollar snapshot —
           see the accumulation loop for why. */
        amount: true,
        currency: true,
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
          where: { deletedAt: null },
          select: {
            weightKg: true,
            invoice: {
              select: {
                total: true,
                amountPaid: true,
                amountAdjusted: true,
                status: true,
                /* Needed to total in shillings without going through the
                   dollar snapshot — see the batch figures below. */
                currency: true,
                exchangeRate: true,
              },
            },
          },
        },
        expenses: {
          where: { status: { not: "VOID" }, expenseClass: { not: "NON_OPERATING" } },
          select: { amount: true, currency: true, amountUsd: true },
        },
      },
    }),

    /*
      Twelve months of trend, summed by the database into one row per month.
      The chart only ever reads monthly totals, so the year's documents are
      grouped in SQL rather than carried into the process row by row. Invoices
      and expenses are read by their own dates — issuedAt and incurredAt — so
      a month shows the work that happened in it, and each WHERE restates the
      window figures' own rules exactly: abandoned debt is not revenue, a void
      cost is not a cost, and a cancelled payment is not a collection — voided
      out here too, or a correction made today would leave a phantom spike in
      a past month that no other screen agrees with.
    */
    Promise.all([
      prisma.$queryRaw<
        { month: Date; total: Prisma.Decimal | null; kg: Prisma.Decimal | null }[]
      >`
        SELECT
          date_trunc('month', i."issuedAt") AS "month",
          SUM(i."total")                    AS "total",
          SUM(s."weightKg")                 AS "kg"
        FROM "Invoice" i
        LEFT JOIN "Shipment" s ON s."id" = i."shipmentId"
        WHERE i."issuedAt" >= ${trendStart}
          AND i."status" NOT IN ('DRAFT', 'VOID', 'WRITTEN_OFF')
        GROUP BY 1
      `,
      prisma.$queryRaw<{ month: Date; total: Prisma.Decimal | null }[]>`
        SELECT
          date_trunc('month', "incurredAt") AS "month",
          SUM("amountUsd")                  AS "total"
        FROM "Expense"
        WHERE "incurredAt" >= ${trendStart}
          AND "status" <> 'VOID'
          AND "expenseClass" <> 'NON_OPERATING'
        GROUP BY 1
      `,
      prisma.$queryRaw<{ month: Date; total: Prisma.Decimal | null }[]>`
        SELECT
          date_trunc('month', "paidAt")             AS "month",
          SUM(COALESCE("creditedAmount", "amount")) AS "total"
        FROM "Payment"
        WHERE "paidAt" >= ${trendStart}
          AND "voidedAt" IS NULL
        GROUP BY 1
      `,
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
    cell.outstandingUsd += outstandingOf(inv);
    customerMap.set(key, cell);
  }

  /* One published rate for the whole dashboard, so two tables on the same
     screen cannot value the same shilling differently. */
  const rate = await currentRateValue();

  // ---------------------------------------------------------------- expenses
  /*
    Accumulated in BOTH units as it goes.

    A cost typed as TSh 20,000 is stored as USD 7.41 — Decimal(12,2), the
    eighth of a cent gone — and a screen that leads in shillings would multiply
    that back and print TSh 20,007. Per row, so the busiest month is furthest
    out. The shilling figure never leaves shillings.
  */
  let batchUsd = 0;
  let officeUsd = 0;
  let specialUsd = 0;
  let batchLocal = 0;
  let officeLocal = 0;
  let specialLocal = 0;
  const categoryMap = new Map<string, { usd: number; local: number }>();
  const expenseBatchMap = new Map<string, { usd: number; local: number }>();
  const bump = (
    map: Map<string, { usd: number; local: number }>,
    key: string,
    usd: number,
    local: number
  ) => {
    const at = map.get(key) ?? { usd: 0, local: 0 };
    map.set(key, { usd: at.usd + usd, local: at.local + local });
  };
  for (const e of expenses) {
    const row: MoneyRow = {
      currency: e.currency,
      amount: e.amount,
      amountUsd: e.amountUsd,
    };
    const usd = sumUsd([row], rate);
    const local = sumShillings([row], rate);
    if (e.expenseClass === "NON_OPERATING") {
      specialUsd += usd;
      specialLocal += local;
      continue;
    }
    if (e.batch) {
      batchUsd += usd;
      batchLocal += local;
      bump(expenseBatchMap, e.batch.batchNumber, usd, local);
    } else {
      officeUsd += usd;
      officeLocal += local;
    }
    bump(categoryMap, e.category, usd, local);
  }
  const operatingTotal = batchUsd + officeUsd;
  const operatingLocal = batchLocal + officeLocal;

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
    outstandingOf(receivable._sum);
  const payableUsd = toNumber(payable._sum.amountUsd);

  // ------------------------------------------------------------- collections
  const counts = Object.fromEntries(
    invoiceCounts.map((row) => [row.status, row._count])
  ) as Record<string, number>;
  const collectedAllTimeUsd = toNumber(collectedAllTime[0]?.collected ?? 0);

  // ----------------------------------------------------------------- batches
  const batches: BatchPerformance[] = batchRows.map((batch) => {
    /*
      THE SAME BASIS AS profitByDispatch, because these two tables render side
      by side. Counting every invoice at face value made a flight that closed
      by writing off its debt look exactly as profitable as one that collected
      all of it — and disagree with the batch page's own band. DRAFT and VOID
      are not billing; a WRITTEN_OFF bill is worth what was actually paid on
      it, and its abandoned remainder is not outstanding.
    */
    const billed = batch.shipments
      .map((s) => s.invoice)
      .filter(
        (inv): inv is NonNullable<typeof inv> =>
          inv !== null && inv.status !== "DRAFT" && inv.status !== "VOID"
      );
    const expected = billed.reduce(
      (n, inv) =>
        n +
        (inv.status === "WRITTEN_OFF"
          ? toNumber(inv.amountPaid)
          : toNumber(inv.total)),
      0
    );
    const collected = billed.reduce((n, inv) => n + toNumber(inv.amountPaid), 0);
    const spent = batch.expenses.reduce((n, e) => n + toNumber(e.amountUsd), 0);
    const profit = expected - spent;

    /*
      And again in shillings, per row.

      Summing the dollar snapshot and multiplying the total back by the rate
      loses a fraction of a cent on every line and then magnifies it by 2,700.
      A shilling cost is already shillings and stays that way; only genuinely
      foreign money goes through the snapshot.
    */
    const invoiceRow = (
      inv: { currency: string; exchangeRate: Prisma.Decimal | null },
      amount: number
    ): MoneyRow => {
      const frozen = toNumber(inv.exchangeRate);
      return {
        currency: inv.currency,
        amount,
        amountUsd:
          inv.currency === LOCAL_CURRENCY ? (frozen ? amount / frozen : 0) : amount,
      };
    };
    const expectedRows = billed.map((inv) =>
      invoiceRow(
        inv,
        inv.status === "WRITTEN_OFF"
          ? toNumber(inv.amountPaid)
          : toNumber(inv.total)
      )
    );
    const collectedRows = billed.map((inv) =>
      invoiceRow(inv, toNumber(inv.amountPaid))
    );
    const spentRows: MoneyRow[] = batch.expenses.map((e) => ({
      currency: e.currency,
      amount: e.amount,
      amountUsd: e.amountUsd,
    }));
    const expectedLocal = sumShillings(expectedRows, rate);
    const collectedLocal = sumShillings(collectedRows, rate);
    const expensesLocal = sumShillings(spentRows, rate);
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
      expectedLocal,
      collectedLocal,
      outstandingLocal: Math.max(0, expectedLocal - collectedLocal),
      expensesLocal,
      profitLocal: expectedLocal - expensesLocal,
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
  /* date_trunc hands the month back as a UTC timestamp, so its calendar month
     is read in UTC — read locally, a west-of-Greenwich clock would file every
     month under the one before it. */
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  for (const row of trendInvoices) {
    const k = monthKey(row.month);
    if (revenueBy.has(k)) {
      revenueBy.set(k, revenueBy.get(k)! + toNumber(row.total));
      kgBy.set(k, kgBy.get(k)! + toNumber(row.kg));
    }
  }
  for (const row of trendExpenses) {
    const k = monthKey(row.month);
    if (expenseBy.has(k)) expenseBy.set(k, expenseBy.get(k)! + toNumber(row.total));
  }
  for (const row of trendPayments) {
    const k = monthKey(row.month);
    if (collectedBy.has(k))
      collectedBy.set(k, collectedBy.get(k)! + toNumber(row.total));
  }

  const revenueSeries = months.map((m) => revenueBy.get(m.key)!);
  const expenseSeries = months.map((m) => expenseBy.get(m.key)!);

  // ------------------------------------------------------------------ health
  const collectionRate = pct(paidOnThose, expectedUsd);
  const expenseRatio = pct(pl.costs, pl.revenue);
  /* Both sides all-time. The receivable carries no window, so the collected
     half must not either — one period's collections under an all-time debt
     made the ratio move with the filter dates while the debt stood still. */
  const outstandingRatio = pct(receivableUsd, receivableUsd + collectedAllTimeUsd);
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
      totalLocal: operatingLocal + specialLocal,
      batchLocal,
      officeLocal,
      specialLocal,
      byCategory: [...categoryMap.entries()]
        .map(([category, total]) => ({
          category,
          amount: total.usd,
          amountLocal: total.local,
          share: operatingTotal > 0 ? (total.usd / operatingTotal) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      byBatch: [...expenseBatchMap.entries()]
        .map(([batchNumber, total]) => ({
          batchNumber,
          amount: total.usd,
          amountLocal: total.local,
        }))
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
