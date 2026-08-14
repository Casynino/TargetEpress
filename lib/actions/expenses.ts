"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import {
  EXPENSE_APPROVAL_THRESHOLD_USD as APPROVAL_THRESHOLD_USD,
  EXPENSE_CATEGORIES as CATEGORIES,
  EXPENSE_CLASSES,
} from "@/lib/expenses";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextExpenseNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { can } from "@/lib/rbac";
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
  expenseClass: z.enum(EXPENSE_CLASSES).default("OPERATING"),
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
    /*
      A cost waits for a signature only when the person recording it cannot
      sign it themselves.

      The threshold is not gone — it still holds for any desk that may record a
      cost but not approve one. What has gone is Finance being stopped by it:
      Finance now holds expense.approve, so a clearing charge at the port is
      recorded and paid in one action instead of waiting for the CEO to open an
      approval screen. Who approved it is still written down, and when the
      recorder approved their own cost that is exactly what the audit log says.
    */
    const needsApproval =
      usd > APPROVAL_THRESHOLD_USD && !can(user.role, "expense.approve");
    const incurredAt = input.incurredAt ?? new Date();

    const expenseNumber = await prisma.$transaction(async (tx) => {
      /*
        A closed flight takes no more costs.

        The whole point of drawing a line under a batch is that what it made
        stops moving. A customs receipt found in somebody's bag two months
        later is a real cost and it should be recorded — but recording it has
        to reopen the books deliberately, with a reason, rather than silently
        change a profit figure the owner has already read.
      */
      if (input.batchId) {
        const batch = await tx.batch.findUnique({
          where: { id: input.batchId },
          select: { batchNumber: true, closedAt: true },
        });
        if (batch?.closedAt) {
          throw new Error(
            `${batch.batchNumber} ${t(locale, "is closed. Reopen it to add a cost.")}`
          );
        }
      }

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
          expenseClass: input.expenseClass,
          vendor: input.vendor || null,
          description: input.description,
          // Validated since this form was written, and never written down.
          note: input.note || null,
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
      /*
        The threshold again, at the moment it matters — but read against the
        person paying, not against the amount alone.

        Somebody who may approve a cost should not have to approve it on one
        screen and then pay it on another: paying it IS the sign-off, and the
        row records that they gave it. Somebody who may not approve still
        cannot pay an unapproved cost, whatever route the form took.
      */
      const overThreshold = toNumber(expense.amountUsd) > APPROVAL_THRESHOLD_USD;
      const mayApprove = can(user.role, "expense.approve");

      if (expense.status === "PENDING" && overThreshold && !mayApprove) {
        throw new Error(
          `${expense.expenseNumber} is over the ${APPROVAL_THRESHOLD_USD} dollar approval limit and has not been approved yet.`
        );
      }
      const approvedOnPayment =
        expense.status === "PENDING" && overThreshold && mayApprove;

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
        data: {
          status: "PAID",
          accountId: account.id,
          paidAt,
          // Who signed it off, when the payment was itself the sign-off. An
          // approval that happened but is not written down is not an approval.
          ...(approvedOnPayment
            ? { approvedById: user.id, approvedAt: paidAt }
            : {}),
        },
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

/* ------------------------------------------------------------- corrections */

const editSchema = z.object({
  expenseId: z.string().trim().min(1),
  category: z.enum(CATEGORIES),
  expenseClass: z.enum(EXPENSE_CLASSES),
  description: z.string().trim().min(3, "Say what this was for."),
  vendor: z.string().trim().optional(),
  note: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
  incurredAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "That date is not valid."),
  /// Not optional. A correction without a reason is indistinguishable from a
  /// mistake, six months later, to the person trying to understand the books.
  reason: z.string().trim().min(3, "Say why this is being corrected."),
});

/** Human labels, so the history reads as English rather than as column names. */
const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  expenseClass: "Counts towards profit",
  description: "Description",
  vendor: "Paid to",
  note: "Note",
  batchId: "Dispatch",
  incurredAt: "Date incurred",
};

/**
 * Correct a cost that was recorded wrongly.
 *
 * What can be changed depends on whether the money has moved. Anything
 * descriptive — what it was for, which category, which flight, the date it was
 * incurred — is editable at any time, because getting those right is the whole
 * point of letting Finance correct its own records.
 *
 * The AMOUNT is not editable once the cost is PAID. A paid expense has a
 * ledger line behind it and an account balance that agrees with a bank
 * statement; quietly changing the figure would leave the register saying one
 * thing and the books another. That case is a reversal, not an edit, and
 * `reverseExpense` is the door.
 *
 * Every change is written twice: as FieldChange rows carrying the before and
 * after values, and as one audit entry carrying the reason. The ledger is
 * append-only and so is this.
 */
export async function editExpense(
  _prev: ActionResult<{ expenseNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ expenseNumber: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("expense.record");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = editSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const expenseNumber = await prisma.$transaction(async (tx) => {
      const before = await tx.expense.findUnique({
        where: { id: input.expenseId },
        select: {
          id: true,
          expenseNumber: true,
          status: true,
          category: true,
          expenseClass: true,
          description: true,
          vendor: true,
          note: true,
          batchId: true,
          incurredAt: true,
          batch: { select: { batchNumber: true } },
        },
      });
      if (!before) throw new Error(t(locale, "That cost no longer exists."));
      if (before.status === "VOID") {
        throw new Error(
          `${before.expenseNumber} ${t(locale, "was cancelled, so there is nothing to correct.")}`
        );
      }

      const after = {
        category: input.category,
        expenseClass: input.expenseClass,
        description: input.description,
        vendor: input.vendor || null,
        note: input.note || null,
        batchId: input.batchId || null,
        incurredAt: input.incurredAt ?? before.incurredAt,
      };

      // Only what actually moved. A "correction" that changed nothing should
      // leave no trail, or the history becomes noise nobody reads.
      const changes: { field: string; before: string | null; after: string | null }[] = [];
      const show = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === "") return null;
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        return String(value);
      };
      for (const key of Object.keys(FIELD_LABELS)) {
        const a = show(key, (before as Record<string, unknown>)[key]);
        const b = show(key, (after as Record<string, unknown>)[key]);
        if (a !== b) {
          changes.push({ field: FIELD_LABELS[key], before: a, after: b });
        }
      }

      if (changes.length === 0) {
        throw new Error(t(locale, "Nothing was changed."));
      }

      await tx.expense.update({ where: { id: before.id }, data: after });

      await tx.fieldChange.createMany({
        data: changes.map((c) => ({
          entity: "Expense",
          entityId: before.id,
          field: c.field,
          before: c.before,
          after: c.after,
          actorId: user.id,
          actorName: user.name ?? user.email ?? null,
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "expense.edit",
          entity: "Expense",
          entityId: before.id,
          summary: `Corrected ${before.expenseNumber}: ${changes
            .map((c) => `${c.field} ${c.before ?? "—"} → ${c.after ?? "—"}`)
            .join("; ")} — ${input.reason}`,
          metadata: { reason: input.reason, changes },
        },
        tx
      );

      return before.expenseNumber;
    });

    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/shipments");
    return ok({ expenseNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const reverseSchema = z.object({
  expenseId: z.string().trim().min(1),
  reason: z.string().trim().min(3, "Say why this is being reversed."),
});

/**
 * Undo a cost whose money has already left an account.
 *
 * Not a deletion and not an edit. The original row stays exactly as it was,
 * its ledger line stays exactly where it was, and an opposite line is written
 * pointing back at it. The account balance returns to what it should have
 * been, and the register still shows both the mistake and the correction —
 * which is the difference between a ledger and a spreadsheet.
 */
export async function reverseExpense(
  _prev: ActionResult<{ expenseNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ expenseNumber: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("ledger.adjust");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = reverseSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const { expenseId, reason } = parsed.data;

  try {
    const expenseNumber = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true,
          expenseNumber: true,
          status: true,
          amount: true,
          amountUsd: true,
          currency: true,
          exchangeRate: true,
          accountId: true,
          ledgerEntry: { select: { id: true, reversedBy: { select: { id: true } } } },
        },
      });
      if (!expense) throw new Error(t(locale, "That cost no longer exists."));
      if (expense.status === "VOID") {
        throw new Error(
          `${expense.expenseNumber} ${t(locale, "was already cancelled.")}`
        );
      }
      if (expense.status !== "PAID" || !expense.accountId || !expense.ledgerEntry) {
        throw new Error(
          `${expense.expenseNumber} ${t(locale, "has not been paid, so cancel it instead of reversing it.")}`
        );
      }
      if (expense.ledgerEntry.reversedBy) {
        throw new Error(
          `${expense.expenseNumber} ${t(locale, "has already been reversed.")}`
        );
      }

      const occurredAt = new Date();

      // The opposite leg: money back IN to the account it left.
      await postLedgerEntry(tx, {
        accountId: expense.accountId,
        currency: expense.currency,
        direction: "IN",
        kind: "ADJUSTMENT",
        amount: toNumber(expense.amount),
        amountUsd: toNumber(expense.amountUsd),
        exchangeRate:
          expense.exchangeRate === null ? null : toNumber(expense.exchangeRate),
        occurredAt,
        description: `Reversal of ${expense.expenseNumber} — ${reason}`,
        sourceEntity: "Expense",
        sourceId: expense.id,
        /*
          Deliberately NOT expenseId.

          LedgerEntry.expenseId is unique — one line per expense, which is what
          makes "money cannot move without a ledger line" enforceable by the
          database rather than by discipline. The reversal is a second line
          about the same cost, so it links through reversesId, which points at
          the entry it cancels, and through sourceId for anyone tracing back to
          the expense.
        */
        recordedById: user.id,
        reversesId: expense.ledgerEntry.id,
      });

      await tx.expense.update({
        where: { id: expense.id },
        data: { status: "VOID", voidedAt: occurredAt, voidReason: reason },
      });

      await recordAudit(
        {
          actor: user,
          action: "expense.reverse",
          entity: "Expense",
          entityId: expense.id,
          summary: `Reversed ${expense.expenseNumber} — ${reason}`,
          metadata: {
            reason,
            amount: toNumber(expense.amount),
            currency: expense.currency,
            amountUsd: toNumber(expense.amountUsd),
            reversedLedgerEntryId: expense.ledgerEntry.id,
          },
        },
        tx
      );

      return expense.expenseNumber;
    });

    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/shipments");
    return ok({ expenseNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
