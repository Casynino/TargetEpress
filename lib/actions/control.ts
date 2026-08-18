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
    "/app/manager/accounts",
    "/app/manager/transactions",
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
] as const;

const reviewSchema = z.object({
  target: z.enum(REVIEW_TARGETS, {
    errorMap: () => ({ message: "Say what kind of record this is about." }),
  }),
  targetId: z.string().trim().min(1, "Missing the record."),
  state: z.enum(REVIEW_STATES, {
    errorMap: () => ({ message: "Choose what you are saying about it." }),
  }),
  reason: z.string().trim().max(600).optional(),
});

/** PENDING is the absence of a verdict, so nobody records one. */
const NEEDS_REASON: ReviewState[] = ["SENT_BACK", "MISMATCH"];

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

  const reason = input.reason ?? "";
  if (NEEDS_REASON.includes(input.state) && reason.length < 4) {
    return fail(
      t(
        locale,
        input.state === "SENT_BACK"
          ? "Say what has to be corrected. A record handed back without a reason cannot be acted on."
          : "Say what does not add up, so somebody can look into the right thing."
      )
    );
  }

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
