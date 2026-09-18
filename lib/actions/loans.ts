"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { isCompanyMoney } from "@/lib/accounts";
import { formatMoney } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { idempotencyKeyFrom, isRepeatSubmission } from "@/lib/idempotency";
import { nextLoanNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import { loanTotals } from "@/lib/loans";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";
import { viewerLocale } from "@/lib/viewer";

const movementSchema = z.object({
  kind: z.enum(["RECEIVED", "REPAID"], {
    message: "Say whether money came in from the lender or went back to the lender.",
  }),
  loanAccountId: z.string().min(1, "Say whose loan this is."),
  accountId: z.string().min(1, "Say which company account the money moved through."),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter an amount."),
  occurredAt: z
    .string()
    .trim()
    .optional()
    /* The form sends a day with no time. Read as midnight, today's date would
       sort before every line recorded earlier today, and the register would
       show a repayment made after a cost as coming first — the loan owing less
       than nothing in between. Today is recorded as now; an earlier day stays
       that day. */
    .transform((v) =>
      !v || v === new Date().toISOString().slice(0, 10) ? null : new Date(v)
    )
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "That date is not valid.")
    .refine(
      (d) => d === null || d.getTime() <= Date.now() + 86_400_000,
      "Money cannot be dated in the future."
    ),
  reference: z.string().trim().max(120, "Keep the reference under 120 characters.").optional(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

/**
 * MONEY BORROWED FROM A LENDER, OR PAID BACK TO HER.
 *
 * Neither income nor a cost. RECEIVED: the lender handed cash to the company —
 * a company account holds more and the company owes more. REPAID: the company
 * paid her back — it holds less and owes less. Costs the lender paid directly
 * are ordinary expenses "paid from" her loan and never come through here.
 *
 * Two ledger lines in one transaction, one on the loan and one on the company
 * account, like a transfer — so the debt and the cash can never disagree, and
 * cancelling one line brings both back.
 *
 * Finance and the owner only (loan.record). The lender is the manager, and the
 * person owed does not write her own debt.
 */
export async function recordLoanMovement(
  _prev: ActionResult<{ movementNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ movementNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("loan.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = movementSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;
  const idempotencyKey = idempotencyKeyFrom(formData);

  try {
    const movementNumber = await prisma.$transaction(async (tx) => {
      /*
        One movement on this loan at a time.

        What is owed is a sum over ledger lines, so there is no single column a
        repayment could claim — two desks repaying at once would each see the
        whole debt and pay it twice. The loan's own row is locked first, so the
        second waits and then reads the debt the first has already reduced.

        NO KEY UPDATE, not UPDATE: it still makes two movements on one loan
        wait for each other, but not a cost or a cancellation posting a line
        against the loan, whose foreign key only needs a key-share lock. A full
        UPDATE lock made those wait on this row while this waited on the
        ledger-number counter they held — a deadlock, and one desk's work
        thrown back with a database error. Nothing else reads what is owed, so
        nothing else needs to queue behind it.
      */
      await tx.$queryRaw`SELECT "id" FROM "CompanyAccount" WHERE "id" = ${input.loanAccountId} FOR NO KEY UPDATE`;

      const [loan, account] = await Promise.all([
        tx.companyAccount.findUnique({
          where: { id: input.loanAccountId },
          select: { id: true, name: true, accountName: true, kind: true, currency: true, active: true },
        }),
        tx.companyAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true, name: true, kind: true, currency: true, active: true },
        }),
      ]);
      if (!loan || loan.kind !== "LOAN") {
        throw new Error("That is not a loan on this system.");
      }
      if (!account || !isCompanyMoney(account.kind)) {
        throw new Error("Choose the company account the money actually moved through.");
      }
      if (!account.active) {
        throw new Error("An archived account cannot send or receive money.");
      }
      if (!loan.active && input.kind === "RECEIVED") {
        throw new Error("This loan is closed, so no more can be borrowed on it.");
      }
      /* One currency end to end. A repayment in dollars against a shilling
         loan is a conversion somebody should see being made — a transfer to a
         shilling account first — not one this record does quietly. */
      if (account.currency !== loan.currency) {
        throw new Error(
          `${loan.name} ${t(locale, "is in")} ${loan.currency} ${t(locale, "and")} ${account.name} ${t(locale, "is in")} ${account.currency}. ${t(locale, "Use an account in the loan's currency.")}`
        );
      }

      const lender = loan.accountName || loan.name;
      const cents = Math.round(input.amount * 100) / 100;

      if (input.kind === "REPAID") {
        const { owed } = await loanTotals(loan.id, tx);
        /* Paying back more than was borrowed would turn the lender into
           somebody who owes the company — a different conversation, and not
           one a mistyped zero should start. */
        if (cents > owed + 0.005) {
          throw new Error(
            `${t(locale, "The company owes")} ${lender} ${formatMoney(owed, loan.currency)}. ${t(locale, "A repayment cannot be more than what is owed.")}`
          );
        }
      }

      const occurredAt = input.occurredAt ?? new Date();
      const rate = loan.currency === "USD" ? null : await currentRateValue(occurredAt);
      if (loan.currency !== "USD" && !rate) {
        throw new Error(
          "No exchange rate has been published, so this cannot be valued in dollars for the reports. Publish a USD→TZS rate first."
        );
      }
      const usd = rate === null ? cents : Math.round((cents / rate) * 100) / 100;

      const number = await nextLoanNumber(tx, occurredAt.getFullYear());
      const movement = await tx.loanMovement.create({
        data: {
          movementNumber: number,
          kind: input.kind,
          loanAccountId: loan.id,
          accountId: account.id,
          amount: new Prisma.Decimal(cents),
          currency: loan.currency,
          reference: input.reference || null,
          note: input.note || null,
          occurredAt,
          recordedById: user.id,
          idempotencyKey,
        },
      });

      const ref = input.reference ? ` — ${input.reference}` : "";
      const kind = input.kind === "RECEIVED" ? "LOAN_RECEIVED" : "LOAN_REPAYMENT";
      const [outOf, into] = input.kind === "RECEIVED" ? [loan, account] : [account, loan];
      const legs = [
        {
          acct: outOf,
          direction: "OUT" as const,
          description:
            input.kind === "RECEIVED"
              ? `${number} — ${lender} lent the company money, into ${account.name}${ref}`
              : `${number} — repaid ${lender}${ref}`,
        },
        {
          acct: into,
          direction: "IN" as const,
          description:
            input.kind === "RECEIVED"
              ? `${number} — borrowed from ${lender}${ref}`
              : `${number} — repayment from ${account.name}${ref}`,
        },
      ];
      for (const leg of legs) {
        await postLedgerEntry(tx, {
          accountId: leg.acct.id,
          currency: loan.currency,
          direction: leg.direction,
          kind,
          amount: cents,
          amountUsd: usd,
          exchangeRate: rate,
          occurredAt,
          description: leg.description,
          sourceEntity: "LoanMovement",
          sourceId: movement.id,
          loanMovementId: movement.id,
          recordedById: user.id,
        });
      }

      await recordAudit(
        {
          actor: user,
          action: input.kind === "RECEIVED" ? "loan.receive" : "loan.repay",
          entity: "LoanMovement",
          entityId: movement.id,
          summary: withNote(
            input.kind === "RECEIVED"
              ? `${number}: borrowed ${loan.currency} ${cents.toLocaleString()} from ${lender}, into ${account.name}${ref}`
              : `${number}: repaid ${lender} ${loan.currency} ${cents.toLocaleString()} from ${account.name}${ref}`,
            input.note
          ),
          metadata: {
            movementNumber: number,
            kind: input.kind,
            lender,
            loanAccount: loan.name,
            account: account.name,
            amount: cents,
            currency: loan.currency,
            reference: input.reference ?? null,
            occurredAt: occurredAt.toISOString(),
          },
        },
        tx
      );

      return number;
    });

    revalidatePath("/app/finance/loans");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance");
    return ok({ movementNumber });
  } catch (error) {
    if (isRepeatSubmission(error)) {
      return fail(
        t(locale, "This was already recorded. Reload the page — recording it again would move the same money twice.")
      );
    }
    return fail(t(locale, toActionError(error)));
  }
}
