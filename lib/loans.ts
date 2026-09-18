import "server-only";

import { toNumber } from "@/lib/format";
import { LIVE_LEG } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import type { TxClient } from "@/lib/prisma";

/**
 * WHAT THE COMPANY OWES A LENDER, AND HOW IT CAME TO OWE IT.
 *
 * Derived from the ledger lines on the loan account every time, like every
 * other figure here — nothing stores a balance. A cost the lender paid is an
 * EXPENSE line OUT of the loan (the company spent her money); cash she handed
 * over is LOAN_RECEIVED OUT of the loan; a repayment is LOAN_REPAYMENT IN. What
 * is owed is everything out less everything in.
 *
 * Live lines only: a cancelled cost or a cancelled repayment and the line that
 * cancelled it are one pair that never happened, and counted on its own either
 * half would invent borrowing or repayment nobody made. In the loan's own
 * currency throughout — never through the dollar column.
 */
const EXPENSE_SELECT = {
  id: true,
  expenseNumber: true,
  description: true,
  category: true,
  status: true,
  batch: { select: { id: true, batchNumber: true } },
} as const;

export type LoanTotals = {
  /** Costs the lender paid directly. */
  expensesPaid: number;
  /** Cash the lender handed to the company. */
  cashReceived: number;
  /** Everything borrowed: the two above. */
  borrowed: number;
  /** What the company has paid back. */
  repaid: number;
  /** What is still owed. Below zero only if more was repaid than borrowed. */
  owed: number;
};

export async function loanTotals(
  loanAccountId: string,
  client: TxClient | typeof prisma = prisma
): Promise<LoanTotals> {
  const rows = await client.ledgerEntry.groupBy({
    by: ["kind", "direction"],
    where: { accountId: loanAccountId, ...LIVE_LEG },
    _sum: { amount: true },
  });
  let expensesPaid = 0;
  let cashReceived = 0;
  let otherOut = 0;
  let repaid = 0;
  let otherIn = 0;
  for (const row of rows) {
    const amount = toNumber(row._sum.amount ?? 0);
    if (row.direction === "OUT") {
      if (row.kind === "EXPENSE") expensesPaid += amount;
      else if (row.kind === "LOAN_RECEIVED") cashReceived += amount;
      else otherOut += amount;
    } else {
      if (row.kind === "LOAN_REPAYMENT") repaid += amount;
      else otherIn += amount;
    }
  }
  const cents = (n: number) => Math.round(n * 100) / 100;
  /* Anything else on the account — an adjustment somebody posted by hand —
     still moves the debt, so it is in the balance even though it has no line
     of its own on the card. */
  const borrowed = cents(expensesPaid + cashReceived + otherOut);
  return {
    expensesPaid: cents(expensesPaid),
    cashReceived: cents(cashReceived),
    borrowed,
    repaid: cents(repaid + otherIn),
    owed: cents(borrowed - repaid - otherIn),
  };
}

/**
 * Every line on the loan account, in the order it was written, with what each
 * one was — the cost it paid, or the money that moved — and who recorded it.
 * Cancelled lines are kept and marked, so the register shows what was believed
 * and what corrected it.
 *
 * IN THE ORDER WRITTEN, NOT THE DATE CLAIMED. A repayment entered the next
 * morning and dated the evening before, or a cost corrected after it was
 * repaid, sorts by its date ahead of lines it came after — and a running
 * figure in that order shows the company owing less than nothing on the way
 * down. In the order the lines were written, each figure is the debt exactly
 * as it stood when that line went in, which is what a repayment was checked
 * against; every line counts, cancelled ones included, because each really did
 * move the debt until the line that answered it.
 */
export async function loanRegister(loanAccountId: string) {
  const lines = await prisma.ledgerEntry.findMany({
    where: { accountId: loanAccountId },
    orderBy: [{ createdAt: "asc" }, { entryNumber: "asc" }],
    select: {
      id: true,
      entryNumber: true,
      direction: true,
      kind: true,
      amount: true,
      currency: true,
      occurredAt: true,
      createdAt: true,
      description: true,
      sourceEntity: true,
      sourceId: true,
      reversesId: true,
      reversedBy: { select: { entryNumber: true } },
      recordedById: true,
      recordedBy: { select: { name: true } },
      expense: { select: EXPENSE_SELECT },
      loanMovement: {
        select: {
          movementNumber: true,
          kind: true,
          reference: true,
          note: true,
          account: { select: { name: true } },
        },
      },
    },
  });

  /* A cost's first line links to it directly; a corrected or moved cost's
     replacement line cannot (one direct link per cost) and names it only as
     its source. Both read as the cost they are. */
  const unlinked = lines
    .filter((line) => !line.expense && line.sourceEntity === "Expense" && line.sourceId)
    .map((line) => line.sourceId as string);
  const bySource = new Map(
    (unlinked.length
      ? await prisma.expense.findMany({ where: { id: { in: unlinked } }, select: EXPENSE_SELECT })
      : []
    ).map((expense) => [expense.id, expense])
  );

  /*
    A corrected cost is two lines written together — the old figure taken off,
    the new one put on — and the debt between them is a figure nobody ever
    owed (take 200,000 off a debt of 100,000 on the way to adding 210,000).
    The running figure is shown once the correction is complete: after the
    last of a run of lines about the same record, by the same person, in the
    same moment.
  */
  const sameStep = (a: (typeof lines)[number], b: (typeof lines)[number] | undefined) =>
    b !== undefined &&
    a.sourceEntity === b.sourceEntity &&
    a.sourceId !== null &&
    a.sourceId === b.sourceId &&
    a.recordedById === b.recordedById &&
    Math.abs(b.createdAt.getTime() - a.createdAt.getTime()) < 2_000;

  let owed = 0;
  return lines.map((line, i) => {
    const live = line.reversesId === null && line.reversedBy === null;
    const amount = toNumber(line.amount);
    owed += line.direction === "OUT" ? amount : -amount;
    return {
      ...line,
      expense:
        line.expense ??
        (line.sourceEntity === "Expense" && line.sourceId ? bySource.get(line.sourceId) ?? null : null),
      amount,
      live,
      /** What was owed once this line was written. */
      owedAfter: Math.round(owed * 100) / 100,
      /** False on the first half of a correction — see sameStep. */
      settled: !sameStep(line, lines[i + 1]),
    };
  });
}
