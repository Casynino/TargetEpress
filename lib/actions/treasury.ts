"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { nextTransferNumber } from "@/lib/ids";
import { postLedgerEntry } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

const transferSchema = z.object({
  fromAccountId: z.string().min(1, "Say which account the money left."),
  toAccountId: z.string().min(1, "Say which account it went into."),
  amountOut: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter an amount."),
  /// What actually landed. Blank means the same as what left, minus the fee —
  /// which is the normal case for a same-currency move.
  amountIn: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v > 0),
      "That received amount is not a number."
    ),
  fee: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "That fee is not a number."),
  exchangeRate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 100 && v <= 100_000),
      "That rate looks wrong for USD→TZS. Check the number of digits."
    ),
  reason: z.string().trim().optional(),
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
      "A transfer cannot be dated in the future."
    ),
});

/**
 * Move money between our own accounts — banking the day's cash, funding the
 * office tin, settling a supplier from the dollar account.
 *
 * Neither income nor cost: the business is no richer for banking its cash, and
 * counting a transfer as either would inflate both halves of the books. It
 * writes two ledger lines in one transaction, OUT of the source and IN to the
 * destination, and the database enforces that there is exactly one of each.
 */
export async function recordTransfer(
  _prev: ActionResult<{ transferNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ transferNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("account.view");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = transferSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  if (input.fromAccountId === input.toAccountId) {
    return fail("Money cannot move from an account into itself.");
  }

  try {
    const transferNumber = await prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.companyAccount.findUnique({
          where: { id: input.fromAccountId },
          select: { id: true, name: true, currency: true, active: true },
        }),
        tx.companyAccount.findUnique({
          where: { id: input.toAccountId },
          select: { id: true, name: true, currency: true, active: true },
        }),
      ]);
      if (!from || !to) throw new Error("One of those accounts no longer exists.");
      if (!from.active || !to.active) {
        throw new Error("An archived account cannot send or receive money.");
      }

      const converting = from.currency !== to.currency;
      if (converting && input.exchangeRate === null && input.amountIn === null) {
        throw new Error(
          `${from.name} is in ${from.currency} and ${to.name} is in ${to.currency}, so say either the rate or the amount that actually landed.`
        );
      }

      // What arrived. Given explicitly when the desk knows it — a bank
      // statement is the truth here — otherwise derived, and the fee comes off
      // the top because that is where the bank takes it.
      let amountIn = input.amountIn;
      if (amountIn === null) {
        amountIn = converting
          ? from.currency === "USD"
            ? (input.amountOut - input.fee) * input.exchangeRate!
            : (input.amountOut - input.fee) / input.exchangeRate!
          : input.amountOut - input.fee;
        amountIn = Math.round(amountIn * 100) / 100;
      }
      if (amountIn <= 0) {
        throw new Error("Nothing would arrive. Check the amount and the fee.");
      }

      const occurredAt = input.occurredAt ?? new Date();

      // The USD value of each leg, so company-wide totals can cross currencies.
      const rate = input.exchangeRate;
      const usdOut =
        from.currency === "USD"
          ? input.amountOut
          : rate
            ? Math.round((input.amountOut / rate) * 100) / 100
            : null;
      const usdIn =
        to.currency === "USD"
          ? amountIn
          : rate
            ? Math.round((amountIn / rate) * 100) / 100
            : null;

      // When no rate is in play and neither side is USD, both legs are the same
      // shillings — valuing them needs today's published rate, and if there
      // isn't one the transfer still happens. A transfer nets to zero across
      // the company, so an unknown USD value never distorts a total.
      const fallbackUsdOut = usdOut ?? 0;
      const fallbackUsdIn = usdIn ?? 0;

      const number = await nextTransferNumber(tx, occurredAt.getFullYear());
      const transfer = await tx.accountTransfer.create({
        data: {
          transferNumber: number,
          fromAccountId: from.id,
          toAccountId: to.id,
          amountOut: new Prisma.Decimal(input.amountOut),
          amountIn: new Prisma.Decimal(amountIn),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          fee: new Prisma.Decimal(input.fee),
          reason: input.reason || null,
          occurredAt,
          recordedById: user.id,
        },
      });

      const label = input.reason ? ` — ${input.reason}` : "";
      await postLedgerEntry(tx, {
        accountId: from.id,
        currency: from.currency,
        direction: "OUT",
        kind: "TRANSFER_OUT",
        amount: input.amountOut,
        amountUsd: fallbackUsdOut,
        exchangeRate: rate,
        occurredAt,
        description: `${number} — to ${to.name}${label}`,
        sourceEntity: "AccountTransfer",
        sourceId: transfer.id,
        transferId: transfer.id,
        recordedById: user.id,
      });
      await postLedgerEntry(tx, {
        accountId: to.id,
        currency: to.currency,
        direction: "IN",
        kind: "TRANSFER_IN",
        amount: amountIn,
        amountUsd: fallbackUsdIn,
        exchangeRate: rate,
        occurredAt,
        description: `${number} — from ${from.name}${label}`,
        sourceEntity: "AccountTransfer",
        sourceId: transfer.id,
        transferId: transfer.id,
        recordedById: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "transfer.record",
          entity: "AccountTransfer",
          entityId: transfer.id,
          summary: `Moved ${from.currency} ${input.amountOut.toLocaleString()} from ${from.name} to ${to.name}${input.fee ? ` (fee ${input.fee.toLocaleString()})` : ""}`,
        },
        tx
      );

      return number;
    });

    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    return ok({ transferNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

const countSchema = z.object({
  accountId: z.string().min(1),
  countedAmount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, "Enter what you counted."),
  note: z.string().trim().optional(),
});

/**
 * Record a physical count of a cash account.
 *
 * The one fact about an account that cannot be derived from its movements, so
 * it is the one thing worth storing. The variance is recorded and left alone:
 * nothing here writes a correcting ledger line, because auto-balancing a cash
 * shortfall is precisely how a shortfall stops being noticed.
 */
export async function recordCashCount(
  _prev: ActionResult<{ variance: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ variance: number }>> {
  let user: SessionUser;
  try {
    user = await authorize("account.view");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = countSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    const variance = await prisma.$transaction(async (tx) => {
      const account = await tx.companyAccount.findUnique({
        where: { id: input.accountId },
        select: { id: true, name: true, kind: true, currency: true },
      });
      if (!account) throw new Error("That account no longer exists.");
      if (account.kind !== "CASH") {
        throw new Error(
          `${account.name} is not a cash account — there is no tin to count. A bank balance is reconciled against a statement, not counted.`
        );
      }

      const movements = await tx.ledgerEntry.groupBy({
        by: ["direction"],
        where: { accountId: account.id },
        _sum: { amount: true },
      });
      const inflow = toNumber(
        movements.find((m) => m.direction === "IN")?._sum.amount ?? 0
      );
      const outflow = toNumber(
        movements.find((m) => m.direction === "OUT")?._sum.amount ?? 0
      );
      const expected = inflow - outflow;
      const diff = Math.round((input.countedAmount - expected) * 100) / 100;
      const countedAt = new Date();

      await tx.cashCount.create({
        data: {
          accountId: account.id,
          countedAt,
          countedAmount: new Prisma.Decimal(input.countedAmount),
          expectedAmount: new Prisma.Decimal(expected),
          variance: new Prisma.Decimal(diff),
          note: input.note || null,
          countedById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "cash.count",
          entity: "CompanyAccount",
          entityId: account.id,
          summary:
            diff === 0
              ? `Counted ${account.name}: ${account.currency} ${input.countedAmount.toLocaleString()}, matches the ledger`
              : `Counted ${account.name}: ${account.currency} ${input.countedAmount.toLocaleString()} against ${expected.toLocaleString()} expected — ${diff > 0 ? "over" : "short"} by ${Math.abs(diff).toLocaleString()}`,
        },
        tx
      );

      return diff;
    });

    revalidatePath("/app/finance/accounts");
    return ok({ variance });
  } catch (error) {
    return fail(toActionError(error));
  }
}

const openingSchema = z.object({
  accountId: z.string().min(1),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine(
      (v) => Number.isFinite(v) && v >= 0,
      "Enter what was in the account, or zero."
    ),
  asOf: z
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
      "An opening balance cannot be dated in the future."
    ),
  note: z.string().trim().optional(),
});

/**
 * What was already in the account before this system existed.
 *
 * Every balance on the Accounts page has carried a caveat since the ledger was
 * built: it counts only what this system has seen, and there is money in CRDB
 * that predates it. The warning was honest and completely inert — it named the
 * gap and offered no way to close it. This closes it.
 *
 * Recorded as an OPENING_BALANCE ledger entry rather than a column, so a
 * balance keeps exactly one derivation path: sum the movements. The opening
 * figure is simply the first movement, dated when the business says the account
 * started counting.
 *
 * Once per account. A second one would silently double the balance, and the
 * honest way to correct a wrong opening figure is a visible adjustment, not a
 * quiet overwrite.
 */
export async function setOpeningBalance(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    // The CEO's, not the money desk's: this figure moves every total on the
    // page and is not a day-to-day act.
    user = await authorize("account.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = openingSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.companyAccount.findUnique({
        where: { id: input.accountId },
        select: {
          id: true,
          name: true,
          currency: true,
          active: true,
          openingSetAt: true,
        },
      });
      if (!account) throw new Error("That account no longer exists.");
      if (!account.active) throw new Error(`${account.name} has been archived.`);
      if (account.openingSetAt) {
        throw new Error(
          `${account.name} already has an opening balance. Correct it with an adjustment so the change is visible, rather than by overwriting it.`
        );
      }

      const occurredAt = input.asOf ?? new Date();

      // Valued in USD like every other line, so company-wide totals can cross
      // currencies. A shilling opening balance with no published rate is still
      // recorded — the shilling figure is the true one and must not be lost
      // because a rate happens to be missing today.
      const rate = account.currency === "USD" ? null : await currentRateValue();
      const amountUsd =
        account.currency === "USD"
          ? input.amount
          : rate
            ? Math.round((input.amount / rate) * 100) / 100
            : 0;

      await tx.companyAccount.update({
        where: { id: account.id },
        data: { openingSetAt: occurredAt },
      });

      await postLedgerEntry(tx, {
        accountId: account.id,
        currency: account.currency,
        direction: "IN",
        kind: "OPENING_BALANCE",
        amount: input.amount,
        amountUsd,
        exchangeRate: rate,
        occurredAt,
        description:
          input.note?.trim() ||
          `Opening balance for ${account.name} — what was in the account when it was put on the system`,
        sourceEntity: "CompanyAccount",
        sourceId: account.id,
        recordedById: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "account.setOpeningBalance",
          entity: "CompanyAccount",
          entityId: account.id,
          summary: `Set opening balance for ${account.name}: ${account.currency} ${input.amount.toLocaleString()}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
