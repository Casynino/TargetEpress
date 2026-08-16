"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { nextExecutiveNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Movements on the executive account.
 *
 * Money out of the company for executive use, and money paid back against it.
 * Both are real cash movements, so both write a line to the general ledger
 * inside the same transaction that records them — the account balances the
 * page shows are derived from that ledger, and a movement that skipped it
 * would leave the bank position wrong.
 *
 * Neither is an expense. They are deliberately kept out of the cost of running
 * the business so that a withdrawal cannot make a profitable month read as a
 * poor one.
 */

const entrySchema = z.object({
  direction: z.enum(["DRAW", "RETURN"]),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter an amount."),
  accountId: z.string().trim().min(1, "Choose the account the money moved on."),
  occurredAt: z
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
      "A movement cannot be dated in the future."
    ),
  /*
    Required, on both directions.

    An unexplained withdrawal is the one row an auditor stops on, and the only
    person who can answer is at the desk at the moment it is recorded. Asking
    later never works.
  */
  reason: z.string().trim().min(3, "Say what this was for."),
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
        "No exchange rate is published, so a shilling movement cannot be valued in dollars. Publish one on Pricing & configuration first."
      )
    );
  }
  return { usd: Math.round((amount / rate) * 100) / 100, rate };
}

export async function recordExecutiveEntry(
  _prev: ActionResult<{ entryNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ entryNumber: string }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("executive.record");
    const parsed = entrySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
    const input = parsed.data;

    const account = await prisma.companyAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, name: true, currency: true, active: true },
    });
    if (!account || !account.active) {
      return fail(t(locale, "That account is not open."));
    }

    const { usd, rate } = await usdValue(input.amount, account.currency, locale);
    const occurredAt = input.occurredAt ?? new Date();
    const isDraw = input.direction === "DRAW";

    /* Uploaded before the transaction opens, exactly as expense receipts are:
       a file crossing the network must not hold a row lock. */
    const receipts = await Promise.all(
      filesFrom(formData, "receipt").map(async (file) => {
        const stored = await putDocument(file, "executive");
        return { ...stored, filename: file.name || "receipt" };
      })
    );

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.executiveEntry.create({
        data: {
          entryNumber: await nextExecutiveNumber(tx, occurredAt.getFullYear()),
          direction: input.direction,
          accountId: account.id,
          amount: new Prisma.Decimal(input.amount),
          currency: account.currency,
          amountUsd: new Prisma.Decimal(usd),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          occurredAt,
          reason: input.reason,
          note: input.note && input.note.length > 0 ? input.note : null,
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

      /* The cash really moved, so the ledger says so — same register, same
         rules, one kind of its own so it can be told apart at a glance. */
      await postLedgerEntry(tx, {
        accountId: account.id,
        currency: account.currency,
        direction: isDraw ? "OUT" : "IN",
        kind: isDraw ? "EXECUTIVE_DRAW" : "EXECUTIVE_RETURN",
        amount: input.amount,
        amountUsd: usd,
        exchangeRate: rate,
        occurredAt,
        description: `${created.entryNumber} — ${input.reason}`,
        sourceEntity: "ExecutiveEntry",
        sourceId: created.id,
        executiveId: created.id,
        recordedById: user.id,
      });

      return created;
    });

    await recordAudit({
      actor: user,
      action: isDraw ? "executive.draw" : "executive.return",
      entity: "ExecutiveEntry",
      entityId: entry.id,
      summary: `${entry.entryNumber}: ${isDraw ? "drew" : "returned"} ${account.currency} ${input.amount.toLocaleString("en-US")} ${isDraw ? "from" : "to"} ${account.name} — ${input.reason}`,
      metadata: {
        direction: input.direction,
        amount: input.amount,
        currency: account.currency,
        amountUsd: usd,
        account: account.name,
        occurredAt: occurredAt.toISOString(),
        reason: input.reason,
        note: input.note ?? null,
        receipts: receipts.length,
      },
    });

    revalidatePath("/app/finance/executive");
    revalidatePath("/app/finance");
    revalidatePath("/app/dashboard");
    return ok({ entryNumber: entry.entryNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const voidSchema = z.object({
  entryId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why this is being cancelled."),
});

/**
 * Cancelling a movement recorded in error.
 *
 * Never a delete. The row stays, marked, with who cancelled it and why, and
 * the ledger line it wrote is answered by a reversing line that points back at
 * it — so the register still shows what was believed at the time and what
 * corrected it. That is the difference between a ledger and a spreadsheet, and
 * it matters most on exactly this account.
 */
export async function voidExecutiveEntry(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("executive.record");
    const parsed = voidSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    await prisma.$transaction(async (tx) => {
      const entry = await tx.executiveEntry.findUnique({
        where: { id: parsed.data.entryId },
        include: { account: { select: { name: true, currency: true } }, ledgerEntry: true },
      });
      if (!entry) throw new Error(t(locale, "That movement no longer exists."));
      if (entry.voidedAt) {
        throw new Error(t(locale, "That movement is already cancelled."));
      }

      await tx.executiveEntry.update({
        where: { id: entry.id },
        data: {
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: parsed.data.reason,
        },
      });

      /* The money goes back the way it came. */
      if (entry.ledgerEntry && !entry.ledgerEntry.reversesId) {
        const original = entry.ledgerEntry;
        await postLedgerEntry(tx, {
          accountId: original.accountId,
          currency: original.currency,
          direction: original.direction === "OUT" ? "IN" : "OUT",
          kind: original.kind,
          amount: toNumber(original.amount),
          amountUsd: toNumber(original.amountUsd),
          exchangeRate:
            original.exchangeRate === null
              ? null
              : toNumber(original.exchangeRate),
          occurredAt: new Date(),
          description: `Reversal of ${entry.entryNumber} — ${parsed.data.reason}`,
          sourceEntity: "ExecutiveEntry",
          sourceId: entry.id,
          recordedById: user.id,
          reversesId: original.id,
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "executive.void",
          entity: "ExecutiveEntry",
          entityId: entry.id,
          summary: `${entry.entryNumber} cancelled — ${parsed.data.reason}`,
          metadata: {
            direction: entry.direction,
            amount: toNumber(entry.amount),
            currency: entry.currency,
            account: entry.account.name,
            reason: parsed.data.reason,
          },
        },
        tx
      );
    });

    revalidatePath("/app/finance/executive");
    revalidatePath("/app/finance");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
