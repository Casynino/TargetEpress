import "server-only";

import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { formatMonthYear, toNumber } from "@/lib/format";
import { BASE_CURRENCY, currentRateValue } from "@/lib/fx";
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
 *
 * VOID and WRITTEN_OFF are excluded on the same terms lib/batch-finance.ts
 * already uses, because revenue meaning one thing here and another on the batch
 * band printed beside it is a worse bug than either figure being wrong on its
 * own. A written-off bill contributes whatever the customer paid before it was
 * given up on — that money is in the bank — and nothing else.
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

  const [
    billed,
    writtenOff,
    collected,
    incurred,
    paidOut,
    byCategory,
    special,
    transferFees,
  ] = await Promise.all([
    // Accrual revenue: bills raised in the window that Finance has confirmed.
    // BILLED_INVOICE_STATUSES rather than a local notIn list, so this asks the
    // question the same way every other revenue total in the app asks it.
    prisma.invoice.aggregate({
      where: { issuedAt: range, status: { in: [...BILLED_INVOICE_STATUSES] } },
      _sum: { total: true },
      _count: true,
    }),
    /*
      Bills the company decided it will never collect.

      These used to sit inside the revenue line above, which overstated profit
      by exactly the debt that had been given up on — costs are unaffected, so
      the whole write-off fell straight through to the bottom line, and to the
      margin, the expense ratio, the growth comparison and the statement PDF.
      Meanwhile the batch band for the same flight (lib/batch-finance.ts:221)
      was pulling it out, so one batch had two revenue figures.

      Split out rather than simply dropped: what the customer paid before the
      write-off is real money and still revenue, and the part nobody will ever
      pay is a fact about the period worth reporting on its own line.
    */
    prisma.invoice.aggregate({
      where: { issuedAt: range, status: "WRITTEN_OFF" },
      _sum: { total: true, amountPaid: true },
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
      /* Cancelled payments never reached the company, so they are not collected
         revenue. The reversal on the ledger says the same thing on the cash
         side; this keeps the P&L agreeing with it. */
      where: { paidAt: range, voidedAt: null },
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
    //
    // Row by row, with the source account's currency, because AccountTransfer
    // has no currency column of its own — see the conversion below.
    prisma.accountTransfer.findMany({
      where: { occurredAt: range, fee: { gt: 0 } },
      select: { fee: true, fromAccount: { select: { currency: true } } },
    }),
  ]);

  const writtenOffPaid = toNumber(writtenOff._sum.amountPaid);
  const revenue = toNumber(billed._sum.total) + writtenOffPaid;
  const writtenOffUsd = toNumber(writtenOff._sum.total) - writtenOffPaid;
  const cashIn = collected.reduce(
    (sum, payment) =>
      sum + toNumber(payment.creditedAmount ?? payment.amount),
    0
  );

  /*
    A fee is recorded in the source account's currency: dollars on the one USD
    bank account, shillings on the other five.

    Summing them in SQL and dividing the total by the USD→TZS rate produced a
    figure in neither currency — a USD 25 wire fee beside a TSh 5,000 mobile
    fee came out as USD 1.86, so the cost line written specifically to stop
    profit being overstated was itself understating cost by the wire fee. Each
    fee is converted on its own now, and only a shilling fee with no published
    rate at all can still be dropped.

    Valued at today's published rate rather than the rate on the day: at this
    size that is close enough, and dropping the fee entirely is the failure
    this code exists to prevent.
  */
  const rate = await currentRateValue();
  const feeUsd =
    Math.round(
      transferFees.reduce((sum, transfer) => {
        const fee = toNumber(transfer.fee);
        if (transfer.fromAccount.currency === BASE_CURRENCY) return sum + fee;
        return rate ? sum + fee / rate : sum;
      }, 0) * 100
    ) / 100;

  const costs = toNumber(incurred._sum.amountUsd) + feeUsd;
  const cashOut = toNumber(paidOut._sum.amountUsd) + feeUsd;

  const specialUsd = toNumber(special._sum.amountUsd);

  return {
    window,
    // Confirmed bills only, so the count and the revenue figure printed beside
    // it ("billed on N confirmed invoices") are counting the same invoices.
    invoices: billed._count,
    revenue,
    /*
      Billed, and given up on.

      Kept out of revenue and out of the margin, reported on its own line — the
      treatment lib/batch-finance.ts gives it per flight, and for the same
      reason: a month that made its number by collecting what it billed and one
      that made it after abandoning a fifth of the billing are not the same
      month, and a single revenue figure cannot say which happened.
    */
    writtenOff: writtenOffUsd,
    writtenOffCount: writtenOff._count,
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
    /*
      Same definition of revenue as the P&L above and as the batch band in
      lib/batch-finance.ts: a written-off bill is worth what was collected
      before it was abandoned, not its face value. Counting the face value here
      made a flight that closed by writing off its billing look exactly as
      profitable as one that collected all of it.
    */
    const revenue = batch.shipments.reduce((sum, shipment) => {
      const invoice = shipment.invoice;
      if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID") {
        return sum;
      }
      if (invoice.status === "WRITTEN_OFF") {
        return sum + toNumber(invoice.amountPaid);
      }
      return sum + toNumber(invoice.total);
    }, 0);
    const writtenOff = batch.shipments.reduce((sum, shipment) => {
      const invoice = shipment.invoice;
      if (!invoice || invoice.status !== "WRITTEN_OFF") return sum;
      return sum + toNumber(invoice.total) - toNumber(invoice.amountPaid);
    }, 0);
    const drafts = batch.shipments.filter(
      (s) => s.invoice?.status === "DRAFT"
    ).length;
    const costs = batch.expenses.reduce(
      (sum, expense) => sum + toNumber(expense.amountUsd),
      0
    );

    // A write-off belongs here at whatever was paid before it: that money was
    // received and never handed back. Which is also why `outstanding` below
    // lands on nothing owed for it — revenue and collected agree.
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
      // Kept as its own total rather than left inside revenue, so the flight
      // can say it gave up on money instead of quietly looking smaller.
      writtenOff,
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
