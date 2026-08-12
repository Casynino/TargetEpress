"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import {
  EXPENSE_APPROVAL_THRESHOLD_USD as APPROVAL_THRESHOLD_USD,
  EXPENSE_CATEGORIES as CATEGORIES,
} from "@/lib/expenses";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextExpenseNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

const expenseSchema = z.object({
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(3, "Say what this was for."),
  vendor: z.string().trim().optional(),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter an amount."),
  currency: z.enum(["TZS", "USD"]),
  /// Which account it left. Blank means it has not been paid yet — the cost is
  /// recorded and waits.
  accountId: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
  /// When the cost was incurred. Blank means today.
  incurredAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null))
    .refine(
      (d) => d === null || !Number.isNaN(d.getTime()),
      "That date is not valid."
    )
    .refine(
      (d) => d === null || d.getTime() <= Date.now() + 86_400_000,
      "A cost cannot be dated in the future."
    ),
  note: z.string().trim().optional(),
});

/** USD value of an amount, at the rate published today. */
async function usdValue(amount: number, currency: string, locale: Locale = "en") {
  if (currency === "USD") return { usd: amount, rate: null as number | null };
  const rate = await currentRateValue();
  if (!rate) {
    throw new Error(
      t(
        locale,
        "No exchange rate is published, so a shilling cost cannot be valued in dollars. Publish one on Pricing & configuration first."
      )
    );
  }
  return { usd: Math.round((amount / rate) * 100) / 100, rate };
}

/**
 * Why an expense cannot be approved, by the status it is already in.
 *
 * Keyed rather than interpolated: "EXP-1 is paid, so there is nothing to
 * approve" cannot be composed in Chinese from an English shape without the
 * status word landing in the wrong place, and a whole sentence per status is
 * three dictionary entries instead of a broken one.
 */
const NOTHING_TO_APPROVE: Record<string, string> = {
  APPROVED: "has already been approved, so there is nothing to approve.",
  PAID: "has already been paid, so there is nothing to approve.",
  VOID: "was cancelled, so there is nothing to approve.",
};

/**
 * Record a cost — and, when an account is named and the amount is under the
 * approval threshold, pay it in the same action.
 *
 * One action rather than two, because that is how the money actually moves at
 * a small company: somebody pays the clearing agent and then writes it down.
 * Splitting "record" from "pay" for every TZS 20,000 would make the honest path
 * the slow one.
 */
export async function recordExpense(
  _prev: ActionResult<{ expenseNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ expenseNumber: string }>> {
  // The reader's language, resolved before anything can fail: every message
  // this action can return is read by the person who submitted the form.
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("expense.record");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = expenseSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  // Uploaded before the transaction opens, exactly as payment proofs are: a
  // file crossing the network must not hold a row lock, and a receipt that
  // fails to store must fail the whole thing loudly rather than leaving a cost
  // recorded with evidence nobody can find.
  let receipts: { url: string; contentType: string; bytes: number; filename: string }[];
  try {
    receipts = await Promise.all(
      filesFrom(formData, "receipt").map(async (file) => {
        const stored = await putDocument(file, "expense");
        return { ...stored, filename: file.name || "receipt" };
      })
    );
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  try {
    const { usd, rate } = await usdValue(input.amount, input.currency, locale);
    const needsApproval = usd > APPROVAL_THRESHOLD_USD;
    const incurredAt = input.incurredAt ?? new Date();

    const expenseNumber = await prisma.$transaction(async (tx) => {
      let account: {
        id: string;
        name: string;
        currency: string;
        active: boolean;
      } | null = null;

      if (input.accountId) {
        account = await tx.companyAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true, name: true, currency: true, active: true },
        });
        if (!account) {
          throw new Error(t(locale, "That account no longer exists."));
        }
        if (!account.active) {
          throw new Error(`${account.name} ${t(locale, "has been archived.")}`);
        }
        if (account.currency !== input.currency) {
          // The account name, both currency codes and the figure are data; the
          // words between them are the only part that changes language.
          throw new Error(
            `${account.name} ${t(locale, "is a")} ${account.currency} ${t(locale, "account, so")} ${input.currency} ${input.amount.toLocaleString()} ${t(locale, "cannot have left it.")}`
          );
        }
      }

      // Paid now only if the money really left an account AND nobody needs to
      // sign it off first. Otherwise it waits, and no ledger line is written —
      // because no money has moved.
      const paidNow = Boolean(account) && !needsApproval;

      const number = await nextExpenseNumber(tx, incurredAt.getFullYear());
      const expense = await tx.expense.create({
        data: {
          expenseNumber: number,
          category: input.category,
          vendor: input.vendor || null,
          description: input.description,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          amountUsd: new Prisma.Decimal(usd),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          accountId: account?.id ?? null,
          status: paidNow ? "PAID" : "PENDING",
          incurredAt,
          paidAt: paidNow ? new Date() : null,
          batchId: input.batchId || null,
          recordedById: user.id,
          receipts: {
            create: receipts.map((receipt) => ({
              url: receipt.url,
              contentType: receipt.contentType,
              bytes: receipt.bytes,
              filename: receipt.filename,
              uploadedById: user.id,
            })),
          },
        },
      });

      if (paidNow && account) {
        await postLedgerEntry(tx, {
          accountId: account.id,
          currency: account.currency,
          direction: "OUT",
          kind: "EXPENSE",
          amount: input.amount,
          amountUsd: usd,
          exchangeRate: rate,
          occurredAt: expense.paidAt!,
          description: `${number} — ${input.description}${input.vendor ? ` (${input.vendor})` : ""}`,
          sourceEntity: "Expense",
          sourceId: expense.id,
          expenseId: expense.id,
          recordedById: user.id,
        });
      }

      await recordAudit(
        {
          actor: user,
          action: paidNow ? "expense.recordAndPay" : "expense.record",
          entity: "Expense",
          entityId: expense.id,
          summary: paidNow
            ? `Paid ${input.currency} ${input.amount.toLocaleString()} from ${account!.name} — ${input.description}`
            : `Recorded ${input.currency} ${input.amount.toLocaleString()} — ${input.description}${needsApproval ? " (awaiting approval)" : ""}`,
        },
        tx
      );

      return number;
    });

    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    return ok({ expenseNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/** The CEO signs off a cost above the threshold. Does not move any money. */
export async function approveExpense(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("expense.approve");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const id = String(formData.get("expenseId") ?? "");
  if (!id) return fail(t(locale, "Missing expense."));

  try {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new Error(t(locale, "Expense not found."));
      if (expense.status !== "PENDING") {
        throw new Error(
          `${expense.expenseNumber} ${t(
            locale,
            NOTHING_TO_APPROVE[expense.status] ??
              "cannot be approved from its current status."
          )}`
        );
      }

      await tx.expense.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "expense.approve",
          entity: "Expense",
          entityId: id,
          summary: `Approved ${expense.expenseNumber} — ${expense.currency} ${toNumber(expense.amount).toLocaleString()}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/expenses");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Disburse an approved cost from an account.
 *
 * This is the only place an EXPENSE ledger line is written, because this is the
 * only moment money actually leaves. An approved-but-unpaid cost is a decision,
 * not a movement, and putting it in the register would make every account
 * balance wrong by the amount of everything not yet paid.
 */
export async function payExpense(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("expense.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("expenseId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!id) return fail("Missing expense.");
  if (!accountId) return fail("Say which account the money came out of.");

  try {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new Error("Expense not found.");
      if (expense.status === "PAID") {
        throw new Error(`${expense.expenseNumber} has already been paid.`);
      }
      if (expense.status === "VOID") {
        throw new Error(`${expense.expenseNumber} was cancelled.`);
      }
      // The threshold again, at the moment it matters. A cost that needs a
      // signature cannot be paid without one, whatever route the form took.
      if (
        expense.status === "PENDING" &&
        toNumber(expense.amountUsd) > APPROVAL_THRESHOLD_USD
      ) {
        throw new Error(
          `${expense.expenseNumber} is over the ${APPROVAL_THRESHOLD_USD} dollar approval limit and has not been approved yet.`
        );
      }

      const account = await tx.companyAccount.findUnique({
        where: { id: accountId },
        select: { id: true, name: true, currency: true, active: true },
      });
      if (!account) throw new Error("That account no longer exists.");
      if (!account.active) throw new Error(`${account.name} has been archived.`);
      if (account.currency !== expense.currency) {
        throw new Error(
          `${account.name} is a ${account.currency} account, so ${expense.currency} ${toNumber(expense.amount).toLocaleString()} cannot have left it.`
        );
      }

      const paidAt = new Date();
      await tx.expense.update({
        where: { id },
        data: { status: "PAID", accountId: account.id, paidAt },
      });

      await postLedgerEntry(tx, {
        accountId: account.id,
        currency: account.currency,
        direction: "OUT",
        kind: "EXPENSE",
        amount: toNumber(expense.amount),
        amountUsd: toNumber(expense.amountUsd),
        exchangeRate:
          expense.exchangeRate === null ? null : toNumber(expense.exchangeRate),
        occurredAt: paidAt,
        description: `${expense.expenseNumber} — ${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`,
        sourceEntity: "Expense",
        sourceId: expense.id,
        expenseId: expense.id,
        recordedById: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "expense.pay",
          entity: "Expense",
          entityId: id,
          summary: `Paid ${expense.expenseNumber} — ${expense.currency} ${toNumber(expense.amount).toLocaleString()} from ${account.name}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Cancel a cost that should not have been recorded.
 *
 * Only before it is paid. Once money has left an account there is a ledger line
 * against it, and the ledger is append-only — a paid expense is undone by a
 * reversing entry, not by voiding the record and pretending the money came back.
 */
export async function voidExpense(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("expense.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("expenseId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return fail("Missing expense.");
  if (reason.length < 3) return fail("Say why this is being cancelled.");

  try {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new Error("Expense not found.");
      if (expense.status === "PAID") {
        throw new Error(
          `${expense.expenseNumber} has been paid, and money that has left an account cannot be un-spent by cancelling the record. Reverse it in the ledger instead.`
        );
      }
      if (expense.status === "VOID") return;

      await tx.expense.update({
        where: { id },
        data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
      });

      await recordAudit(
        {
          actor: user,
          action: "expense.void",
          entity: "Expense",
          entityId: id,
          summary: `Cancelled ${expense.expenseNumber}: ${reason}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/expenses");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
