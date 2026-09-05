"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type ReviewState, type ReviewTarget } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { accountBalances } from "@/lib/ledger";
import { prisma, type TxClient } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * The manager's two controls: checking an account, and disputing a record.
 *
 * NEITHER OF THEM CHANGES ANYTHING THEY LOOK AT. That is the owner's rule and
 * it is the whole design: "do not silently change financial records". A manager
 * who disagrees with a payment does not edit the payment — Finance still sees
 * exactly what they entered, and a row beside it says a manager disputes it and
 * why. The desk then records a correction through the ordinary correction path,
 * which already answers a wrong line with a reversing line rather than an edit.
 *
 * So there is no update in this file that touches a Payment, an Expense, a
 * Batch, an Invoice or a LedgerEntry. Only inserts, into two tables that exist
 * to hold opinions about them.
 */

function paths() {
  for (const p of [
    "/app/manager",
    "/app/manager/control",
    "/app/manager/batches",
    "/app/manager/reconciliation",
    "/app/finance",
    "/app/finance/accounts",
    "/app/finance/transactions",
  ]) {
    revalidatePath(p);
  }
}

/* ------------------------------------------------------ checking an account */

const money = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform((v) => Number(v.replace(/,/g, "")))
    .refine((v) => Number.isFinite(v), message);

const reconcileSchema = z.object({
  accountId: z.string().trim().min(1, "Choose an account."),
  /* The figure from OUTSIDE — a bank statement, a till count, a phone screen.
     The only number in this app that does not come from this app. */
  actualBalance: money("Enter what the account actually holds."),
  asOf: z
    .string()
    .trim()
    .min(1, "Say which day this balance is from.")
    .transform((v) => new Date(v))
    .refine((d) => !Number.isNaN(d.getTime()), "That date is not valid.")
    .refine(
      (d) => d.getTime() <= Date.now() + 86_400_000,
      "A balance cannot be from the future."
    ),
  note: z.string().trim().max(400).optional(),
});

/**
 * Record what an account really held, and what that says about the books.
 *
 * THE SYSTEM SIDE IS COMPUTED HERE, NEVER SUBMITTED. The form shows the ledger
 * balance so the manager can see what they are comparing against, but that
 * displayed figure is not what gets stored — this reads it again inside the
 * transaction. A reconciliation whose "system" number could be typed by the
 * person doing the reconciling would certify nothing at all.
 *
 * The verdict is arithmetic, not a choice: equal within a cent is RECONCILED,
 * anything else is MISMATCH. Nobody gets to mark a difference "fine" — that is
 * what the note is for, and a difference without one is refused.
 */
export async function reconcileAccount(
  _prev: ActionResult<{ difference: number; state: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ difference: number; state: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("account.reconcile");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = reconcileSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.companyAccount.findUnique({
        where: { id: input.accountId },
        select: { id: true, name: true, currency: true, active: true },
      });
      if (!account) throw new Error(t(locale, "That account no longer exists."));
      if (!account.active) {
        throw new Error(
          `${account.name} ${t(
            locale,
            "has been archived, so there is nothing live to reconcile."
          )}`
        );
      }

      /* Read the ledger here, not from the form. */
      const balances = await accountBalances(tx);
      const row = balances.find((b) => b.accountId === account.id);
      const systemBalance = row
        ? toNumber(row.inflow) - toNumber(row.outflow)
        : 0;

      const difference = Math.round((input.actualBalance - systemBalance) * 100) / 100;
      const agrees = Math.abs(difference) < 0.01;

      if (!agrees && !input.note) {
        throw new Error(
          t(
            locale,
            "The two figures differ, so say what you think accounts for it before recording this."
          )
        );
      }

      const check = await tx.accountReconciliation.create({
        data: {
          accountId: account.id,
          asOf: input.asOf,
          systemBalance: new Prisma.Decimal(systemBalance),
          actualBalance: new Prisma.Decimal(input.actualBalance),
          difference: new Prisma.Decimal(difference),
          currency: account.currency,
          state: agrees ? "RECONCILED" : "MISMATCH",
          note: input.note || null,
          checkedById: user.id,
        },
        select: { id: true, state: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "account.reconcile",
          entity: "AccountReconciliation",
          entityId: check.id,
          summary: agrees
            ? `Reconciled ${account.name} — ${account.currency} ${systemBalance.toLocaleString()} agrees`
            : `${account.name} did not balance — ${account.currency} ${difference.toLocaleString()} out`,
          metadata: {
            accountId: account.id,
            systemBalance,
            actualBalance: input.actualBalance,
            difference,
            asOf: input.asOf.toISOString(),
          },
        },
        tx
      );

      return { difference, state: check.state };
    });

    paths();
    return ok(result);
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------ disputing a record */

const REVIEW_TARGETS = [
  "PAYMENT",
  "EXPENSE",
  "BATCH",
  "LEDGER_ENTRY",
  "INVOICE",
] as const;

const REVIEW_STATES = [
  "RECONCILED",
  "MISMATCH",
  "UNDER_REVIEW",
  "SENT_BACK",
  /* Something is wrong with the record beyond the figures disagreeing, and a
     question asked of the desk that recorded it. Both are verdicts a manager
     reaches without being able to say yet whose fault it is. */
  "FLAGGED",
  "INFO_REQUESTED",
] as const;

/* What a flag is ABOUT, kept as a short prefix on the reason rather than as a
   column: the set will grow the first week it is used, and a schema change per
   new kind of wrong is a schema change nobody makes — so the kinds live here,
   where adding one is a line. */
const FLAG_KINDS = [
  "Incorrect amount",
  "Missing document",
  "Wrong account",
  "Duplicate transaction",
  "Unknown transaction",
  "Other",
] as const;
/* The list is deliberately NOT exported. This file carries "use server", which
   may only export async functions — exporting it broke every page that renders
   the panel. The client component keeps its own copy of the labels; this one is
   what the action validates against, which is the copy that matters. */

const reviewSchema = z.object({
  target: z.enum(REVIEW_TARGETS, {
    errorMap: () => ({ message: "Say what kind of record this is about." }),
  }),
  targetId: z.string().trim().min(1, "Missing the record."),
  state: z.enum(REVIEW_STATES, {
    errorMap: () => ({ message: "Choose what you are saying about it." }),
  }),
  reason: z.string().trim().max(600).optional(),
  /* Only read for a flag. Anything else ignores it rather than refusing it,
     because the same form posts every verdict. */
  issue: z.enum(FLAG_KINDS).optional(),
});

/**
 * NOTHING IS REFUSED FOR WANT OF AN EXPLANATION ANY MORE.
 *
 * These four verdicts used to demand words: a flag with none is an alarm
 * nobody can act on, a request for information containing no question is not
 * one. That argument is still true, and the screens still ask — but asking is
 * where it ends. A desk clearing forty duplicate records was typing the same
 * sentence forty times to get past the bar, which is not a record of anything.
 *
 * The verdict, the record it lands on, the person and the moment are all
 * written either way. Kept as a list because the screens read it to decide
 * which prompts to put in front of the reader.
 */
const NEEDS_REASON: ReviewState[] = [
  "SENT_BACK",
  "MISMATCH",
  "FLAGGED",
  "INFO_REQUESTED",
];

/** Does the thing being judged actually exist? */
async function targetExists(
  tx: TxClient,
  target: ReviewTarget,
  id: string
) {
  switch (target) {
    case "PAYMENT":
      return Boolean(await tx.payment.findUnique({ where: { id }, select: { id: true } }));
    case "EXPENSE":
      return Boolean(await tx.expense.findUnique({ where: { id }, select: { id: true } }));
    case "BATCH":
      return Boolean(await tx.batch.findUnique({ where: { id }, select: { id: true } }));
    case "LEDGER_ENTRY":
      return Boolean(await tx.ledgerEntry.findUnique({ where: { id }, select: { id: true } }));
    case "INVOICE":
      return Boolean(await tx.invoice.findUnique({ where: { id }, select: { id: true } }));
    default:
      return false;
  }
}

/**
 * Say what you think of a record somebody else entered.
 *
 * APPEND, NEVER OVERWRITE. Sending a payment back on Monday and reconciling it
 * on Friday is two rows, not one row edited twice, because the sequence is the
 * thing a manager or an auditor needs to read six months later: recorded, sent
 * back with this reason, corrected, reviewed, agreed. Overwriting would leave
 * only the last word and quietly delete the argument.
 *
 * There is no delete and no update in this action. The current standing of a
 * record is simply its newest row.
 */
/**
 * ONE VERDICT ACROSS MANY RECORDS, because a busy week is not read one row at a
 * time.
 *
 * The owner: "we are going to have busy scheled so and i shluld be able to pick
 * and choose and i shulud be able to choose all and reconcele". So this takes a
 * set of ids and writes the same verdict against each — still one append-only
 * ManagerReview per record, still one audit line per record, because a bulk
 * action that collapsed into a single row would leave the history unable to say
 * what happened to any individual consignment.
 *
 * WHAT IT WILL NOT DO IN BULK: nothing here bypasses the rules the single
 * verdict follows. The same permission is demanded, and a record that has
 * vanished since the page was
 * drawn is skipped rather than failing the whole batch — the count that comes
 * back is what was actually written, not what was asked for.
 */
const BULK_LIMIT = 300;

export async function reviewRecords(
  _prev: ActionResult<{ written: number; skipped: number; state: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ written: number; skipped: number; state: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("record.review");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))];
  if (ids.length === 0) {
    return fail(t(locale, "Tick the records you want to act on first."));
  }
  if (ids.length > BULK_LIMIT) {
    return fail(
      t(locale, "That is more than can be agreed in one go. Narrow the filters and repeat.")
    );
  }

  const parsed = reviewSchema
    .omit({ targetId: true })
    .safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  const reason =
    input.state === "FLAGGED" && input.issue
      ? `${input.issue}: ${input.reason ?? ""}`.trim()
      : input.reason ?? "";


  try {
    const result = await prisma.$transaction(async (tx) => {
      let written = 0;
      for (const targetId of ids) {
        if (!(await targetExists(tx, input.target, targetId))) continue;

        const review = await tx.managerReview.create({
          data: {
            target: input.target,
            targetId,
            state: input.state,
            reason: reason || null,
            reviewedById: user.id,
          },
          select: { id: true },
        });

        await recordAudit(
          {
            actor: user,
            action: `review.${input.state.toLowerCase()}`,
            entity: input.target,
            entityId: targetId,
            summary: `${
              input.state === "SENT_BACK" ? "Sent back" : "Marked"
            } ${input.target.toLowerCase().replace("_", " ")} ${input.state
              .toLowerCase()
              .replace("_", " ")}${reason ? ` — ${reason}` : ""} (one of ${ids.length})`,
            metadata: { reviewId: review.id, state: input.state, batchOf: ids.length },
          },
          tx
        );
        written += 1;
      }
      return written;
    });

    paths();
    return ok({ written: result, skipped: ids.length - result, state: input.state });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

export async function reviewRecord(
  _prev: ActionResult<{ state: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ state: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("record.review");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = reviewSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  /* A flag carries its kind in front of the words, so the reason reads as a
     sentence wherever it is shown — the control room, the history, the audit —
     without every one of those places having to know about flag kinds. */
  const reason =
    input.state === "FLAGGED" && input.issue
      ? `${input.issue}: ${input.reason ?? ""}`.trim()
      : input.reason ?? "";


  try {
    const state = await prisma.$transaction(async (tx) => {
      if (!(await targetExists(tx, input.target, input.targetId))) {
        throw new Error(
          t(locale, "That record no longer exists, so there is nothing to review.")
        );
      }

      const review = await tx.managerReview.create({
        data: {
          target: input.target,
          targetId: input.targetId,
          state: input.state,
          reason: reason || null,
          reviewedById: user.id,
        },
        select: { id: true, state: true },
      });

      await recordAudit(
        {
          actor: user,
          action: `review.${input.state.toLowerCase()}`,
          entity: input.target,
          entityId: input.targetId,
          summary:
            input.state === "SENT_BACK"
              ? `Sent a ${input.target.toLowerCase().replace("_", " ")} back — ${reason}`
              : `Marked a ${input.target.toLowerCase().replace("_", " ")} ${input.state.toLowerCase().replace("_", " ")}${reason ? ` — ${reason}` : ""}`,
          metadata: { reviewId: review.id, state: input.state },
        },
        tx
      );

      return review.state;
    });

    paths();
    return ok({ state });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
