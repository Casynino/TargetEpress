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
  total: number,
  /**
   * WHAT FINANCE CLEARED WITHOUT MONEY ARRIVING.
   *
   * REQUIRED, AND THAT IS THE WHOLE POINT — the same lesson BalanceInput
   * learned. It was optional so existing callers kept compiling, and five of
   * them went on never passing it: charging storage, waiving it, discounting a
   * bill, and settling one from customer credit. Each re-derives the STORED
   * status from two of the three figures, so a bill whose balance Finance had
   * cleared came back PARTIALLY_PAID and its cargo stopped being releasable,
   * and a bill discounted to what had been paid could be written UNPAID.
   *
   * A caller with genuinely nothing cleared passes 0 and says so.
   *
   * The stored status stays PAID for that case rather than gaining a state of
   * its own. Forty-three places in this app test `status === "PAID"`, and a
   * settled bill is settled whichever way the last shilling was accounted for
   * — what differs is what the reader is TOLD, and that label is derived in
   * lib/invoice-balance.ts where it can say "fully cleared — adjustment 625".
   */
  adjusted: number
): InvoiceStatus | null {
  if (current === "VOID" || current === "WRITTEN_OFF" || current === "DRAFT") {
    return null;
  }
  /* Untouched by either — nobody has paid and nobody has cleared anything. */
  if (paid <= 0.005 && adjusted <= 0.005) return "UNPAID";
  /* Overpaying settles it too: a customer who sent more than the bill asked
     for owes nothing, and the excess is shown as an overpayment rather than
     netted off somebody else's debt. */
  if (paid + adjusted + 0.005 >= total) return "PAID";
  return "PARTIALLY_PAID";
}
