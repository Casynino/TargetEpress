"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { roundMoney, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextExpenseNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import { toLocal } from "@/lib/money";
import { codeFor, payrollRoster, runTotals } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/*
  The month's salaries, in five steps and one money movement.

  The owner's rule, in his words: Finance prepares the salary run, sends it to
  the manager, the manager approves it, and only THEN is the money deducted as
  a salary expense. Everything in this file exists to make that sentence true
  rather than customary — the desk that writes the figures cannot agree them
  (two permissions), the desk that agrees them cannot have written them (the
  self-approval refusal in decidePayrollRun), and four of the five steps move
  no money at all.

  Paying is the only step that touches an account, and it does what every other
  cost in this app does: books an Expense and posts its ledger line, in one
  transaction, so payroll lands in the profit and loss and in the bank position
  by the same route as a customs receipt. Nothing here invents a second way for
  money to leave.
*/

/** The screens a run appears on: Finance builds it, the manager decides it. */
const PAYROLL_PATHS = [
  "/app/finance/payroll",
  "/app/manager/payroll",
  "/app/manager/approvals",
];

function revalidatePayroll() {
  for (const path of PAYROLL_PATHS) revalidatePath(path);
}

/** The two statuses the run still belongs to Finance in. */
const EDITABLE = ["DRAFT", "REJECTED"] as const;

/*
  Why a step is refused, keyed by the status the run is already in.

  Keyed rather than interpolated, for the reason given on the same pattern in
  lib/actions/expenses.ts: a whole sentence per status is three dictionary
  entries, where a composed one is a status word dropped wherever English
  happens to put it.
*/
const NOT_EDITABLE: Record<string, string> = {
  PENDING_APPROVAL:
    "is with the manager and is frozen while it waits. It has to come back before a figure on it can change.",
  APPROVED: "has been agreed, so its figures are settled.",
  PAID: "has been paid, so it cannot be changed.",
};

const NOT_DECIDABLE: Record<string, string> = {
  DRAFT: "has not been sent up yet, so there is nothing to decide.",
  APPROVED: "has already been agreed.",
  REJECTED: "has already been sent back.",
  PAID: "has already been paid.",
};

const NOT_PAYABLE: Record<string, string> = {
  DRAFT: "has not been sent for approval, so it cannot be paid.",
  PENDING_APPROVAL: "is still waiting to be agreed, so it cannot be paid.",
  REJECTED: "was sent back. Finance fixes it and it is agreed again before anybody is paid.",
  PAID: "has already been paid.",
};

/** Form numbers arrive as strings; blank means zero on a salary line. */
const money = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0, message);

const periodSchema = z.object({
  year: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 2020 && v <= 2100, "Choose a year."),
  month: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 12, "Choose a month."),
});

/**
 * Finance builds the month from the staff register.
 *
 * Built rather than typed: the names, roles and salaries all already exist on
 * the staff records, and a run keyed in by hand is a second register that
 * disagrees with the first by one leaver a month. What Finance then edits is
 * the exceptions — an allowance, an advance being recovered — which is the part
 * no register can know.
 */
export async function buildPayrollRun(
  _prev: ActionResult<{ id: string; code: string; headcount: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string; code: string; headcount: number }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("payroll.prepare");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = periodSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const { year, month } = parsed.data;

  /* A month that has not started has no salaries in it yet. Building one is a
     mis-typed year in practice, and it would take the @@unique slot the real
     run needs when the month finally comes. */
  if (new Date(year, month - 1, 1).getTime() > Date.now()) {
    return fail(
      `${codeFor(year, month)} ${t(locale, "is a month that has not started yet.")}`
    );
  }

  const roster = await payrollRoster();
  if (roster.length === 0) {
    return fail(
      t(
        locale,
        "Nobody on the staff register has a monthly salary set, so there is nothing to build. Set salaries on the staff records first."
      )
    );
  }

  try {
    const run = await prisma.$transaction(async (tx) => {
      /*
        One live run per month, and the reason to check rather than let the
        constraint speak is that the answer is a door. "PR-2026-08 already
        exists" tells Finance to open it; the constraint's own error tells them
        to try again, which they will, forever.
      */
      const existing = await tx.payrollRun.findUnique({
        where: { year_month: { year, month } },
        select: { code: true },
      });
      if (existing) {
        throw new Error(
          `${existing.code} ${t(
            locale,
            "already covers that month. Open it instead of building a second one."
          )}`
        );
      }

      const created = await tx.payrollRun.create({
        data: {
          code: codeFor(year, month),
          year,
          month,
          preparedById: user.id,
          items: {
            create: roster.map((person) => ({
              userId: person.id,
              /* Snapshots, copied off the staff record now and never read
                 through it again — see the note on PayrollItem in the schema. */
              name: person.name,
              roleLabel: person.roleLabel,
              employeeId: person.employeeId,
              gross: new Prisma.Decimal(person.baseSalary),
              allowance: new Prisma.Decimal(0),
              deduction: new Prisma.Decimal(0),
              net: new Prisma.Decimal(person.baseSalary),
            })),
          },
        },
        select: { id: true, code: true },
      });

      const gross = roundMoney(
        roster.reduce((sum, person) => sum + person.baseSalary, 0)
      );

      await recordAudit(
        {
          actor: user,
          action: "payroll.build",
          entity: "PayrollRun",
          entityId: created.id,
          summary: `Built ${created.code} — ${roster.length} staff, USD ${gross.toFixed(2)}`,
        },
        tx
      );

      return created;
    });

    revalidatePayroll();
    return ok({ id: run.id, code: run.code, headcount: roster.length });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const itemSchema = z.object({
  itemId: z.string().trim().min(1, "Missing salary line."),
  allowance: money("An allowance cannot be negative."),
  deduction: money("A deduction cannot be negative."),
  note: z.string().trim().optional(),
});

/**
 * Finance edits one person's line.
 *
 * Gross is not editable here on purpose. What somebody is paid a month is a
 * fact about their employment and lives on their staff record; changing it on
 * a run would give a raise for one month that nobody agreed and nothing
 * remembers. An allowance and a deduction are the opposite — they are true of
 * this month only, which is exactly why they are columns on the line.
 */
export async function updatePayrollItem(
  _prev: ActionResult<{ net: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ net: number }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("payroll.prepare");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = itemSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const net = await prisma.$transaction(async (tx) => {
      const item = await tx.payrollItem.findUnique({
        where: { id: input.itemId },
        select: {
          id: true,
          name: true,
          gross: true,
          run: { select: { id: true, code: true, status: true } },
        },
      });
      if (!item) throw new Error(t(locale, "That salary line no longer exists."));

      if (!EDITABLE.some((status) => status === item.run.status)) {
        throw new Error(
          `${item.run.code} ${t(
            locale,
            NOT_EDITABLE[item.run.status] ?? "cannot be changed from its current status."
          )}`
        );
      }

      const value = roundMoney(
        toNumber(item.gross) + input.allowance - input.deduction
      );
      /* A negative net is not a salary, it is a bill sent to the employee. If a
         deduction really is larger than the month's pay — an advance being
         recovered — it is recovered across months, which is a decision somebody
         takes, not one this form makes silently. */
      if (value < 0) {
        throw new Error(
          `${item.name}: ${t(
            locale,
            "a deduction cannot take a month's pay below zero."
          )}`
        );
      }

      /* The claim. Scoped through the run's status as well as the line's id, so
         an edit that started while the run was still Finance's cannot land a
         hundredth of a second after it was sent up — and change a figure the
         manager is already reading. */
      const claimed = await tx.payrollItem.updateMany({
        where: { id: item.id, run: { status: { in: [...EDITABLE] } } },
        data: {
          allowance: new Prisma.Decimal(input.allowance),
          deduction: new Prisma.Decimal(input.deduction),
          net: new Prisma.Decimal(value),
          note: input.note || null,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(
            locale,
            "That run was sent for approval a moment ago, so it can no longer be edited. Reload the page."
          )
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "payroll.updateItem",
          entity: "PayrollRun",
          entityId: item.run.id,
          summary: `Edited ${item.name} on ${item.run.code} — allowance USD ${input.allowance.toFixed(
            2
          )}, deduction USD ${input.deduction.toFixed(2)}, net USD ${value.toFixed(2)}`,
        },
        tx
      );

      return value;
    });

    revalidatePayroll();
    return ok({ net });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const submitSchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  accountId: z
    .string()
    .trim()
    .min(1, "Name the account the salaries will be paid from."),
  note: z.string().trim().optional(),
});

/**
 * Finance sends the month up.
 *
 * The account is required HERE rather than at payment, and that is the point of
 * the step: the manager has to be agreeing to a payment out of a named account
 * with a balance he can check, not to a total. Choosing it afterwards would let
 * an agreed figure be paid from somewhere nobody agreed to.
 */
export async function submitPayrollRun(
  _prev: ActionResult<{ code: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ code: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("payroll.prepare");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = submitSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const code = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          code: true,
          status: true,
          items: {
            select: { gross: true, allowance: true, deduction: true, net: true },
          },
        },
      });
      if (!run) throw new Error(t(locale, "That run no longer exists."));

      if (!EDITABLE.some((status) => status === run.status)) {
        throw new Error(
          `${run.code} ${t(
            locale,
            NOT_EDITABLE[run.status] ?? "cannot be sent from its current status."
          )}`
        );
      }

      const totals = runTotals(run.items);
      if (totals.headcount === 0) {
        throw new Error(
          `${run.code} ${t(locale, "has nobody on it, so there is nothing to agree.")}`
        );
      }

      const account = await tx.companyAccount.findUnique({
        where: { id: input.accountId },
        select: { id: true, name: true, active: true },
      });
      if (!account) throw new Error(t(locale, "That account no longer exists."));
      if (!account.active) {
        throw new Error(`${account.name} ${t(locale, "has been archived.")}`);
      }

      /* The claim, and what it stops is two clicks on one button: the second
         finds the run already sent and changes nothing, rather than stamping a
         second submission time over the age the manager is being shown. */
      const claimed = await tx.payrollRun.updateMany({
        where: { id: run.id, status: { in: [...EDITABLE] } },
        data: {
          status: "PENDING_APPROVAL",
          submittedAt: new Date(),
          accountId: account.id,
          note: input.note || null,
          /* Last time's ruling goes with it. A run waiting for a decision that
             still carries the previous rejection reads as already refused, and
             a stale approver's name on a pending run is worse than none. */
          approvedById: null,
          approvedAt: null,
          decisionNote: null,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(
            locale,
            "That run was sent for approval a moment ago. Reload the page before trying again."
          )
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "payroll.submit",
          entity: "PayrollRun",
          entityId: run.id,
          summary: `Sent ${run.code} for approval — ${totals.headcount} staff, USD ${totals.net.toFixed(
            2
          )} from ${account.name}`,
        },
        tx
      );

      return run.code;
    });

    revalidatePayroll();
    return ok({ code });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const decisionSchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  decision: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "Agree the run, or send it back." }),
  }),
  decisionNote: z.string().trim().optional(),
});

/**
 * The manager agrees the month, or sends it back with a reason.
 *
 * Still no money. Agreeing is a signature on a figure; paying is a separate
 * action with its own click, because the day the salaries actually go out is a
 * fact about the bank rather than about the decision.
 *
 * A rejection must say why. A run returned with a blank note sends Finance
 * looking through thirty lines for an objection they cannot see, and the note
 * is the only part of this workflow that travels back down.
 */
export async function decidePayrollRun(
  _prev: ActionResult<{ status: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ status: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("payroll.approve");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = decisionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  const note = input.decisionNote ?? "";
  if (input.decision === "REJECTED" && note.length < 4) {
    return fail(t(locale, "Say what is wrong with it before sending it back."));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          code: true,
          status: true,
          preparedById: true,
          items: {
            select: { gross: true, allowance: true, deduction: true, net: true },
          },
        },
      });
      if (!run) throw new Error(t(locale, "That run no longer exists."));

      if (run.status !== "PENDING_APPROVAL") {
        throw new Error(
          `${run.code} ${t(
            locale,
            NOT_DECIDABLE[run.status] ?? "cannot be decided from its current status."
          )}`
        );
      }

      /*
        Nobody agrees their own run.

        The permissions alone do not stop this: the owner and the manager both
        hold payroll.prepare through their full grant, so either could build a
        month and then sign it. Two steps that one person can walk end to end
        are one step with extra clicks — and this is the step that decides what
        leaves the company's account, so the refusal is here, on the identity,
        rather than in a role list that cannot express it.
      */
      if (run.preparedById === user.id) {
        throw new Error(
          `${run.code} ${t(
            locale,
            "was prepared by you, so somebody else has to agree it. That split is the whole control."
          )}`
        );
      }

      const claimed = await tx.payrollRun.updateMany({
        where: { id: run.id, status: "PENDING_APPROVAL" },
        data: {
          status: input.decision,
          approvedById: user.id,
          approvedAt: new Date(),
          decisionNote: note || null,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(
            locale,
            "Somebody decided this run a moment ago. Reload the page to see what they said."
          )
        );
      }

      const totals = runTotals(run.items);
      await recordAudit(
        {
          actor: user,
          action: input.decision === "APPROVED" ? "payroll.approve" : "payroll.reject",
          entity: "PayrollRun",
          entityId: run.id,
          summary:
            input.decision === "APPROVED"
              ? `Agreed ${run.code} — ${totals.headcount} staff, USD ${totals.net.toFixed(2)}`
              : `Sent ${run.code} back — ${note}`,
          metadata: { decisionNote: note || null },
        },
        tx
      );
    });

    revalidatePayroll();
    return ok({ status: input.decision });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const paySchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  /** The day the money actually left. Blank means today. */
  paidAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "That date is not valid.")
    .refine(
      (d) => d === null || d.getTime() <= Date.now() + 86_400_000,
      "Salaries cannot be dated in the future."
    ),
});

/**
 * The money leaves. The only step in this file that moves any.
 *
 * It books a SALARIES expense and posts its ledger line in the same
 * transaction, exactly as lib/actions/expenses.ts does for every other cost —
 * so the month's payroll reaches the profit and loss and the bank position
 * through the one route the rest of the app already trusts, and a run that
 * failed halfway cannot leave an expense with no ledger line or a line with no
 * expense.
 *
 * The run is denominated in dollars and the account may be in shillings, so the
 * conversion happens once, here, at the published rate, and the rate is frozen
 * onto both the expense and the ledger line. Re-reading it later at a different
 * rate would restate what was paid.
 */
export async function payPayrollRun(
  _prev: ActionResult<{ expenseNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ expenseNumber: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("payroll.approve");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = paySchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  // Read before the transaction opens, like the receipts in recordExpense: the
  // rate lives in another table and has no business being fetched while the run
  // is locked.
  const publishedRate = await currentRateValue();

  try {
    const expenseNumber = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          code: true,
          status: true,
          expenseId: true,
          account: {
            select: { id: true, name: true, currency: true, active: true },
          },
          items: {
            select: { gross: true, allowance: true, deduction: true, net: true },
          },
        },
      });
      if (!run) throw new Error(t(locale, "That run no longer exists."));

      if (run.status !== "APPROVED") {
        throw new Error(
          `${run.code} ${t(
            locale,
            NOT_PAYABLE[run.status] ?? "cannot be paid from its current status."
          )}`
        );
      }
      /* Belt as well as braces on the claim below. The column is unique, so a
         second expense would fail anyway — this is the version of that failure
         a person can read. */
      if (run.expenseId) {
        throw new Error(
          `${run.code} ${t(locale, "has already been booked as an expense.")}`
        );
      }

      const account = run.account;
      if (!account) {
        throw new Error(
          `${run.code} ${t(
            locale,
            "names no account, so there is nothing to pay it from. Send it back to Finance."
          )}`
        );
      }
      if (!account.active) {
        throw new Error(
          `${account.name} ${t(
            locale,
            "has been archived, so nothing can leave it. Send the run back to Finance to name another account."
          )}`
        );
      }

      const totals = runTotals(run.items);
      if (totals.net <= 0) {
        throw new Error(
          `${run.code} ${t(locale, "adds up to nothing, so there is nothing to pay.")}`
        );
      }

      /* USD is what the run is written in; the account decides what actually
         leaves it. A dollar account converts nothing and carries no rate — the
         same rule the transfer legs follow in lib/actions/treasury.ts. */
      const usd = totals.net;
      const rate = account.currency === "USD" ? null : publishedRate;
      if (account.currency !== "USD" && !rate) {
        throw new Error(
          t(
            locale,
            "No exchange rate is published, so a dollar salary bill cannot be paid out of a shilling account. Publish one on Pricing & configuration first."
          )
        );
      }
      const amount = rate === null ? usd : toLocal(usd, rate);

      const paidAt = input.paidAt ?? new Date();

      /*
        The claim, taken BEFORE anything is written.

        Two managers pressing pay at the same moment both read APPROVED; the
        second one's update finds the row already PAID and touches nothing, so
        it throws before an expense exists. Reversed — expense first, status
        after — the loser of the race would already have booked a second
        month's salaries against the account.
      */
      const claimed = await tx.payrollRun.updateMany({
        where: { id: run.id, status: "APPROVED", expenseId: null },
        data: { status: "PAID", paidAt, paidById: user.id },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(
            locale,
            "This run was paid by somebody else a moment ago. Reload the page before trying again."
          )
        );
      }

      const number = await nextExpenseNumber(tx, paidAt.getFullYear());
      const description = `Salaries ${run.code} — ${totals.headcount} staff`;
      const expense = await tx.expense.create({
        data: {
          expenseNumber: number,
          category: "SALARIES",
          // Salaries are what it costs to run the company between flights, so
          // they belong in operating profit rather than against one dispatch.
          // No batchId for the same reason.
          expenseClass: "OPERATING",
          description,
          amount: new Prisma.Decimal(amount),
          currency: account.currency,
          amountUsd: new Prisma.Decimal(usd),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          accountId: account.id,
          status: "PAID",
          /* Incurred and paid on the same day, unlike most costs here: the
             month's work was earned across the month, but the bill exists only
             when the company agrees it and settles it, on this date. */
          incurredAt: paidAt,
          paidAt,
          recordedById: user.id,
        },
      });

      await postLedgerEntry(tx, {
        accountId: account.id,
        currency: account.currency,
        direction: "OUT",
        kind: "EXPENSE",
        amount,
        amountUsd: usd,
        exchangeRate: rate,
        occurredAt: paidAt,
        description: `${number} — ${description}`,
        /*
          "Expense", exactly like every other cost, and NOT "PayrollRun".

          Pointing this at the run read better — a reader following the line
          back wants the thirty names, not the total — but it is not a label,
          it is a key. editExpense finds the line it must reverse with
          findFirst({ sourceEntity: "Expense", sourceId: expense.id }), so a
          payroll line filed under its own entity would not have been found:
          correcting a paid salary bill would have rewritten the expense and
          left the ledger stating the original amount, silently, with both
          records internally consistent and only the pair wrong.

          The run is still one hop away — expenseId ties this line to the cost,
          and the cost carries the run.
        */
        sourceEntity: "Expense",
        sourceId: expense.id,
        expenseId: expense.id,
        recordedById: user.id,
      });

      await tx.payrollRun.update({
        where: { id: run.id },
        data: { expenseId: expense.id },
      });

      await recordAudit(
        {
          actor: user,
          action: "payroll.pay",
          entity: "PayrollRun",
          entityId: run.id,
          summary: `Paid ${run.code} — ${account.currency} ${amount.toLocaleString()} from ${account.name} (${totals.headcount} staff)`,
          metadata: { expenseNumber: number, netUsd: usd, exchangeRate: rate },
        },
        tx
      );

      return number;
    });

    revalidatePayroll();
    // The three money screens this now shows up on. Payroll is a cost like any
    // other the moment it is paid, and it has to appear on them immediately.
    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    return ok({ expenseNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
