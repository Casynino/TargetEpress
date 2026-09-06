import { toNumber, type Numeric } from "@/lib/format";

/**
 * WHAT A BILL STILL OWES, IN ONE PLACE.
 *
 * The balance used to be `total - amountPaid`, and it was spelled out by hand
 * in about a hundred places. That was survivable while there were two columns.
 * There are three now — Finance can clear a difference the customer is never
 * going to send — and a balance computed anywhere that has not heard about the
 * third will go on telling a customer they owe 625 shillings after somebody
 * cleared them, and will go on refusing to release their cargo.
 *
 * So it is answered here and nowhere else.
 *
 * THE THREE FIGURES.
 *
 *   total          what the bill came to
 *   amountPaid     REAL MONEY that arrived. Never rewritten to match the bill.
 *   amountAdjusted what Finance cleared without money arriving. Never money,
 *                  never in an account, never in a "collected" total.
 *
 * A cent of tolerance, because these are decimals that have been through a
 * currency conversion and "settled" must not hinge on the last digit of a
 * rounding.
 */

const CENT = 0.005;

export type BalanceInput = {
  total: Numeric;
  amountPaid: Numeric;
  /**
   * REQUIRED, AND THAT IS THE WHOLE POINT.
   *
   * It was optional, on the reasonable-sounding argument that a row selected
   * before adjustments existed should read as none. What it actually bought
   * was silence: a dozen queries up and down the app selected `total` and
   * `amountPaid`, handed the pair to this function, and got an answer that
   * ignored every shilling ever written off — with no type error, because the
   * missing field was allowed to be missing.
   *
   * The flight that could never close, the invoice PDF that asked a customer
   * for money already cleared, the credit book that kept eating a settled
   * customer's limit: all one bug, wearing twelve hats, and all invisible
   * because of the question mark that used to sit here.
   *
   * A caller that genuinely has no adjustments to report passes 0 and says so.
   */
  amountAdjusted: Numeric;
};

export type Balance = {
  /** What the bill came to. */
  due: number;
  /** Real money received against it. */
  paid: number;
  /** Cleared by decision, not by money. */
  adjusted: number;
  /** What is still owed. Never negative — see `overpaid`. */
  balance: number;
  /** Money received beyond the bill. Zero unless the customer sent too much. */
  overpaid: number;
  /** Owed and not yet cleared. Zero once the balance is closed. */
  shortfall: number;
  /** Nothing left to collect: the cargo may go. */
  settled: boolean;
  /** Settled, and only because somebody cleared the remainder. */
  clearedByAdjustment: boolean;
};

export function invoiceBalance(invoice: BalanceInput): Balance {
  const due = toNumber(invoice.total);
  const paid = toNumber(invoice.amountPaid);
  const adjusted = toNumber(invoice.amountAdjusted);

  /* Money first, then the decision. The remainder cannot go below zero: a
     customer who sends too much is owed money, not owing it, and a negative
     balance netted off somebody else's debt in every receivable total. */
  /* Rounded to the cent, because these are subtractions of decimals and a
     figure that reaches a screen as 0.5700000000000003 is a figure nobody
     trusts. The tolerance below still does the deciding; this only settles
     how the number reads and how it is stored. */
  const cent = (n: number) => Math.round(n * 100) / 100;

  const afterMoney = cent(due - paid);
  const balance = Math.max(0, cent(afterMoney - adjusted));
  const overpaid = Math.max(0, cent(paid - due));
  const shortfall = Math.max(0, afterMoney);

  return {
    due,
    paid,
    adjusted,
    balance,
    overpaid,
    shortfall,
    settled: balance <= CENT,
    clearedByAdjustment: balance <= CENT && adjusted > CENT && afterMoney > CENT,
  };
}

/** The bare figure, for the many places that only want the number. */
/**
 * WHAT A SET OF BILLS IS OWED — SUMMED THE ONLY WAY THAT MEANS ANYTHING.
 *
 * `outstandingOf` clamps a NEGATIVE balance to zero, because a customer who
 * sent too much is owed money rather than owing it. Handed a Prisma `_sum`
 * that clamp arrives far too late: the totals, the payments and the
 * adjustments are added up across every bill in the set FIRST, so one
 * customer's overpayment quietly cancels another customer's debt and the
 * single clamp at the end never sees either of them.
 *
 * A hundred customers each owing a thousand and one who overpaid by a hundred
 * thousand read as a company owed nothing.
 *
 * The clamp has to happen per bill, which SQL will do and an aggregate will
 * not. Written as a fragment so the four screens that ask this question ask it
 * identically.
 */
export const RECEIVABLE_SQL = `
  COALESCE(SUM(GREATEST(0, "total" - "amountPaid" - "amountAdjusted")), 0)
`;

/**
 * THE BILL, WHAT ARRIVED AND WHAT WAS LET GO — ALL IN SHILLINGS.
 *
 * A dollar bill settled in shillings cannot be restated by multiplying its
 * dollar columns back out. TSh 36,000 against a USD 13.50 bill stores
 * amountPaid 13.33 and amountAdjusted 0.17; multiply those by 2,700 and you
 * get 35,991 paid and 459 cleared — neither of which anybody handed over or
 * agreed to, and which the desk sees beside a button that said 450.
 *
 * So the shillings come from the shilling figures: the bill at its own frozen
 * rate, the payments at their face value, and the write-off as the remainder.
 * The three then add up exactly, and both of the first two are true.
 *
 * Returns nulls when it cannot be done honestly — no rate, or money that came
 * in denominations other than the local one — and the caller falls back to the
 * bill's own currency rather than inventing a shilling figure.
 */
export function localSplit(invoice: {
  total: Numeric;
  amountAdjusted: Numeric;
  exchangeRate?: Numeric | null;
  payments?: { amount: Numeric; currency: string }[] | null;
}): { billLocal: number | null; paidLocal: number | null; clearedLocal: number | null } {
  const rate = invoice.exchangeRate == null ? 0 : toNumber(invoice.exchangeRate);
  if (!(rate > 0)) return { billLocal: null, paidLocal: null, clearedLocal: null };

  const billLocal = Math.round(toNumber(invoice.total) * rate);
  const rows = invoice.payments ?? [];
  const allLocal = rows.length > 0 && rows.every((p) => p.currency === "TZS");
  if (!allLocal) {
    /* Mixed or dollar payments: the bill converts, the rest cannot be restated
       without inventing figures, so say so. */
    return { billLocal, paidLocal: null, clearedLocal: null };
  }

  const paidLocal = rows.reduce((sum, p) => sum + toNumber(p.amount), 0);
  /* The remainder, never the stored cents multiplied out — and never below
     zero, because an overpayment is not a write-off. */
  const clearedLocal =
    toNumber(invoice.amountAdjusted) > 0.005
      ? Math.max(0, billLocal - paidLocal)
      : 0;
  return { billLocal, paidLocal, clearedLocal };
}

export function outstandingOf(invoice: BalanceInput): number {
  return invoiceBalance(invoice).balance;
}

/** Nothing left to collect — the one question the release gate asks. */
export function isSettled(invoice: BalanceInput): boolean {
  return invoiceBalance(invoice).settled;
}

/**
 * The four sentences a person reads, and no fifth.
 *
 * The stored InvoiceStatus is deliberately NOT extended for these: forty-three
 * places in this app test `status === "PAID"`, and a bill that is settled is
 * settled whether the last shilling arrived or was cleared. What changes is
 * what the reader is told, so the label is derived here and the enum stays as
 * it is — which is also what the owner asked for: no new adjustment statuses.
 */
export type PaymentLabel = {
  kind: "unpaid" | "paid" | "overpaid" | "partial" | "cleared";
  /** English key — pass through t() at the call site. */
  label: string;
  /** The figure the label is about, in the bill's own currency. Zero for a
      plain PAID, which needs no number after it. */
  amount: number;
};

export function paymentLabelFor(invoice: BalanceInput): PaymentLabel {
  const b = invoiceBalance(invoice);

  if (b.overpaid > CENT) {
    return { kind: "overpaid", label: "Paid — overpaid", amount: b.overpaid };
  }
  if (b.clearedByAdjustment) {
    return { kind: "cleared", label: "Fully cleared — adjustment", amount: b.adjusted };
  }
  if (b.settled && b.paid > CENT) {
    return { kind: "paid", label: "Paid", amount: 0 };
  }
  if (b.paid > CENT || b.adjusted > CENT) {
    return { kind: "partial", label: "Partly paid — balance", amount: b.balance };
  }
  return { kind: "unpaid", label: "Awaiting payment", amount: b.balance };
}

/**
 * WHEN AN ADJUSTMENT IS BIG ENOUGH TO BE WORTH A SECOND LOOK.
 *
 * There is no limit and nothing is blocked — the owner was explicit. This only
 * decides whether the row wears a flag so management can find it afterwards.
 *
 * Measured two ways because "large" means two different things: a rounding on
 * a big bill is not the same event as clearing a fifth of a small one. Either
 * test is enough to raise the flag.
 */
/**
 * A twentieth of the bill, or a figure large on its own.
 *
 * The share is the honest test and it needs no currency: the owner's own
 * examples fall on the right side of it — 5,000 cleared on a 100,000 bill is a
 * twentieth and worth a look; 625 on 4,424,625 is a rounding and is not; 10 on
 * 2,990 is neither.
 *
 * A FLAT FIGURE ALONE WOULD BE WRONG, and was: measured in dollars it called
 * that 625 large, because it never asked which money the bill was written in.
 * A bill can be raised in either, so the flat floor is stated in both.
 */
const LARGE_SHARE = 0.05;
const LARGE_FLAT: Record<string, number> = { USD: 20, TZS: 50_000 };

export function isLargeAdjustment(
  amount: number,
  billTotal: number,
  currency = "USD"
): boolean {
  if (billTotal > 0 && amount / billTotal >= LARGE_SHARE) return true;
  return amount >= (LARGE_FLAT[currency] ?? LARGE_FLAT.USD);
}
