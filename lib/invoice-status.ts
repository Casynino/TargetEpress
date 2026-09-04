import type { InvoiceStatus } from "@prisma/client";

/**
 * THE STATUS FOLLOWS THE TOTAL, AND IT IS DERIVED IN ONE PLACE.
 *
 * `status` is the only figure on an invoice that is stored rather than worked
 * out at read time, and it is stored because the pickup gate and the write-off
 * sweep both read it. That makes every door that moves `total` or `amountPaid`
 * responsible for moving the status with it — and for a while only one of them
 * did. Charging storage kept the status honest; correcting the bill through
 * Finance did not, so a bill corrected upward stayed PAID with real money owed
 * on it, and a bill corrected down to exactly what had been paid stayed
 * PARTIALLY_PAID and refused to release the cargo it had been paid for.
 *
 * One function now, called by every one of those doors, so they cannot drift
 * apart again.
 *
 * VOID, WRITTEN_OFF and DRAFT come back null — leave them exactly as they are.
 * The first two are decisions somebody made about the bill itself, and no
 * amount of arithmetic is a reason to overturn one; a draft is not a demand
 * for money at all, so it has no paid state to describe.
 *
 * The tolerance is a cent, because the totals are decimals that have been
 * through a currency conversion and "paid in full" must not hinge on the last
 * digit of a rounding.
 */
export function invoiceStatusFor(
  current: string,
  paid: number,
  total: number
): InvoiceStatus | null {
  if (current === "VOID" || current === "WRITTEN_OFF" || current === "DRAFT") {
    return null;
  }
  if (paid <= 0.005) return "UNPAID";
  if (paid + 0.005 >= total) return "PAID";
  return "PARTIALLY_PAID";
}
