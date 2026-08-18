import "server-only";

import { ROLE_LABELS } from "@/lib/constants";
import { roundMoney, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Reading the payroll. Nothing in this file writes.
 *
 * A run is the one money document here whose figures are SNAPSHOTS rather than
 * derivations — the reason is on PayrollItem in the schema, and it is about a
 * slip for a month that has already happened. The totals are the exception to
 * that exception: they are summed from the lines on every read rather than
 * stored on the header, because a header total and an edited line are two
 * answers to one question, and the wrong one is the one somebody signs.
 */

/** The money columns, however Prisma hands them over. */
type MoneyLike = Parameters<typeof toNumber>[0];

export type PayrollLine = {
  gross: MoneyLike;
  allowance: MoneyLike;
  deduction: MoneyLike;
  net: MoneyLike;
};

export type PayrollTotals = {
  gross: number;
  allowance: number;
  deduction: number;
  /** What actually leaves the account. USD, like every stored figure here. */
  net: number;
  headcount: number;
};

/**
 * The code a month's run is known by: PR-2026-08.
 *
 * Composed from the period rather than drawn from a sequence, unlike every
 * other document number in this app. Those number things that arrive in an
 * order nobody chooses; a salary run is one per month by database constraint,
 * so the month IS the identity — and a composed code can never drift from the
 * two columns it describes.
 */
export function codeFor(year: number, month: number) {
  return `PR-${year}-${String(month).padStart(2, "0")}`;
}

/**
 * What a set of lines adds up to. Pure — no database, no request.
 *
 * Rounded per column rather than at the end: these are Decimal(12,2) figures
 * read through doubles, and summing thirty of them unrounded leaves a net that
 * disagrees with the sum of the slips by a hundredth, on the one screen where
 * a penny out is read as a mistake in somebody's pay.
 */
export function runTotals(items: PayrollLine[]): PayrollTotals {
  return {
    gross: roundMoney(items.reduce((sum, i) => sum + toNumber(i.gross), 0)),
    allowance: roundMoney(items.reduce((sum, i) => sum + toNumber(i.allowance), 0)),
    deduction: roundMoney(items.reduce((sum, i) => sum + toNumber(i.deduction), 0)),
    net: roundMoney(items.reduce((sum, i) => sum + toNumber(i.net), 0)),
    headcount: items.length,
  };
}

/** The money columns every read below totals from, and nothing else. */
const LINE_MONEY = {
  gross: true,
  allowance: true,
  deduction: true,
  net: true,
} as const;

/**
 * Every run, newest month first.
 *
 * Ordered on (year, month) rather than on when the row was made, because a run
 * built late for a month that has passed belongs where the month is, not at the
 * top. The lines are fetched only to be summed and are dropped from the result:
 * a list of twelve months has no use for four hundred salary lines.
 */
export async function payrollRuns(take = 24) {
  const runs = await prisma.payrollRun.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take,
    include: {
      preparedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, currency: true } },
      items: { select: LINE_MONEY },
    },
  });

  return runs.map(({ items, ...run }) => ({ ...run, totals: runTotals(items) }));
}

/**
 * One run, with everything the screen that decides on it has to show.
 *
 * The lines carry `userId` but the staff record is deliberately NOT joined. A
 * slip says what somebody was paid in August; reading their name through the
 * relation would restate August every time they are renamed, promoted or
 * leave — which is the whole reason the columns are snapshots.
 */
export async function payrollRun(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      preparedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
      paidBy: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, currency: true, active: true } },
      expense: { select: { id: true, expenseNumber: true, paidAt: true } },
      items: { orderBy: [{ name: "asc" }] },
    },
  });
  if (!run) return null;

  return { ...run, totals: runTotals(run.items) };
}

export type RosterEntry = {
  id: string;
  name: string;
  roleLabel: string;
  employeeId: string | null;
  /** USD a month. The screen prints shillings at the published rate. */
  baseSalary: number;
};

/**
 * Who a run gets built from.
 *
 * Three conditions, and each excludes a different mistake. `active` is the
 * account switch — a leaver keeps their history and stops being paid.
 * `status ACTIVE` catches somebody suspended, who is still an employee and
 * still must not be run through this month's salaries by default. A null
 * `baseSalary` means nobody has said what this person earns, and a run that
 * guessed zero would print a slip claiming they are owed nothing rather than
 * leaving them off it.
 *
 * Nothing here is a permanent decision: Finance edits the lines afterwards, and
 * a person legitimately off this list is added by setting their salary, on the
 * staff record, where that fact belongs.
 */
export async function payrollRoster(): Promise<RosterEntry[]> {
  const staff = await prisma.user.findMany({
    where: { active: true, status: "ACTIVE", baseSalary: { not: null } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      employeeId: true,
      baseSalary: true,
    },
  });

  return staff.map((person) => ({
    id: person.id,
    name: person.name,
    // The label the rest of the app calls this role, frozen onto the line. The
    // enum value is a database word; a slip is read by the person it pays.
    roleLabel: ROLE_LABELS[person.role],
    employeeId: person.employeeId,
    baseSalary: toNumber(person.baseSalary),
  }));
}

const DAY = 86_400_000;

/**
 * Runs sitting on the manager's desk, the one that has waited longest first.
 *
 * Oldest first, and with the wait in days, for the same reason the approvals
 * page shows an age: a queue read newest-first hides the item that has been
 * ignored, and salaries are the one bill in the company where waiting is felt
 * by everybody in it.
 */
export async function pendingPayrollApproval(now = new Date()) {
  const runs = await prisma.payrollRun.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: [{ submittedAt: "asc" }],
    include: {
      preparedBy: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, currency: true } },
      items: { select: LINE_MONEY },
    },
  });

  return runs.map(({ items, ...run }) => ({
    ...run,
    totals: runTotals(items),
    // Falls back to when it was built, so a run submitted before that column
    // existed still reads as waiting rather than as brand new.
    waitingDays: Math.max(
      0,
      Math.floor(
        (now.getTime() - (run.submittedAt ?? run.preparedAt).getTime()) / DAY
      )
    ),
  }));
}
