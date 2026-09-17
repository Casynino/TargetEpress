import "server-only";

import { Prisma } from "@prisma/client";

import type { TxClient } from "@/lib/prisma";

/**
 * NOT A SERVER ACTION, deliberately.
 *
 * It lived beside reviewPriceChange in lib/actions/ for one commit, and every
 * `"use server"` export is a public endpoint — so a file that writes "the price
 * moved from X to Y, and this person moved it" was reachable by anybody with
 * the URL, who could then forge a clean record for a change nobody made or
 * bury a real one under noise. It takes a transaction it cannot open itself
 * and has no authorize() of its own precisely because nothing outside a
 * transaction should ever be able to call it.
 */
/**
 * The row written when a bill's price moves, called from inside adjustInvoice's
 * transaction so the record and the change land together or not at all.
 *
 * Only for desks that cannot sign a price off themselves. Finance moving a
 * price is not news to Finance, and a queue that lists its own work is a queue
 * nobody reads.
 */
export async function recordPriceChange(
  tx: TxClient,
  input: {
    invoiceId: string;
    actorId: string;
    currency: string;
    totalBefore: number;
    freightBefore: number | null;
    rateBefore: number | null;
    /** The unit that rate was in, where it was not the book's. */
    methodBefore?: "WEIGHT_BASED" | "FIXED_PER_ITEM" | null;
    /** And what it was multiplied by. */
    quantityBefore?: number | null;
    storageBefore: number;
    otherBefore: number;
    discountBefore: number;
    totalAfter: number;
    reason: string | null;
  }
) {
  await tx.invoicePriceChange.create({
    data: {
      invoiceId: input.invoiceId,
      currency: input.currency,
      totalBefore: new Prisma.Decimal(input.totalBefore),
      freightBefore:
        input.freightBefore === null
          ? null
          : new Prisma.Decimal(input.freightBefore),
      rateBefore:
        input.rateBefore === null ? null : new Prisma.Decimal(input.rateBefore),
      methodBefore: input.methodBefore ?? null,
      quantityBefore:
        input.quantityBefore === null || input.quantityBefore === undefined
          ? null
          : new Prisma.Decimal(input.quantityBefore),
      storageBefore: new Prisma.Decimal(input.storageBefore),
      otherBefore: new Prisma.Decimal(input.otherBefore),
      discountBefore: new Prisma.Decimal(input.discountBefore),
      totalAfter: new Prisma.Decimal(input.totalAfter),
      reason: input.reason,
      changedById: input.actorId,
    },
  });
}
