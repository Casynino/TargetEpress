/**
 * Writing money down. No database, no server.
 *
 * Split out of lib/fx.ts, which is server-only because it reads the published
 * rate. Formatting a figure needs none of that, and keeping the two together
 * meant a client component could not print a shilling amount without dragging
 * the whole rate machinery — and failing the build when it tried.
 *
 * The rate itself still belongs on the server. This is only the writing.
 */

/** What the business bills in. */
export const BASE_CURRENCY = "USD";
/** ISO code for the shilling — what the database stores. */
export const LOCAL_CURRENCY = "TZS";

/**
 * A shilling figure, as Tanzania actually writes it.
 *
 * TZS is the ISO code; TSh is what everybody reads, and it is already what the
 * ledger and the dashboards print. Having both on screen made one page look
 * like it was quoting a different currency from the next, so the display
 * symbol is decided here rather than at each call site. The stored code is
 * untouched.
 *
 * Shillings have no useful minor unit at these amounts — a figure to the cent
 * would be four digits of noise on a number in the millions — so they round.
 */
export function formatLocal(amount: number, currency = LOCAL_CURRENCY) {
  const symbol = currency === LOCAL_CURRENCY ? "TSh" : currency;
  return `${symbol} ${Math.round(amount).toLocaleString("en-US")}`;
}

/** Dollars, always to the cent: these are invoice figures. */
export function formatUsd(amount: number) {
  return `${BASE_CURRENCY} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * WHAT A BILL IS ALLOWED TO SAY.
 *
 * Whole units of its own currency, rounded at the half: 20.1 is 20, 20.5 is
 * 21. The owner's rule, and it is the counter's rule too — nobody in Dar es
 * Salaam hands over a cent, and a bill quoting USD 106.65 is quoting a figure
 * that cannot be paid in the money it will actually be paid in.
 *
 * It also makes the shilling figure exact by construction: a whole number of
 * dollars times the rate is a whole number of shillings, so the customer, the
 * receipt, the pickup note and the ledger all read the same thing with nothing
 * left over to round.
 *
 * Applied to the TOTAL, once, and never to the lines inside it. Rounding each
 * line and adding them up gives a different answer from rounding the sum, and
 * the total is the number the customer is asked for.
 *
 * FORWARD ONLY. Bills already confirmed and sent keep the figure the customer
 * was given, to the cent — a quote is a thing somebody was told, and going back
 * over the books to make old paperwork agree with a new rule is how a customer
 * ends up holding an invoice the system disagrees with. A draft is priced when
 * Dar confirms it, which is the first moment the customer hears a number, so
 * drafts confirmed from now on are new bills and get the rule.
 */
export function billedTotal(amount: number): number {
  return Math.round(amount);
}

/**
 * A dollar figure in shillings, at a rate the caller has already chosen.
 *
 * Rounded, because the result is money somebody will hand over, and because a
 * fraction of a shilling has no physical form.
 */
export function toLocal(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

/**
 * A stored dollar figure, written the way this office reads money.
 *
 * Everything is priced in dollars because that is how air freight is sold.
 * Nobody in Dar es Salaam thinks in dollars: the till holds shillings, the
 * customer pays shillings, the salary is a shilling figure. A screen printing
 * USD is asking its reader to convert in their head, at whatever rate they
 * happen to remember, before they can answer a question about their own money.
 *
 * One function rather than a `rate ? … : …` at each call site — which is how
 * the ledger ended up leading in shillings while the profit page beside it led
 * in dollars. With no rate published there is nothing honest to convert with,
 * so the dollar figure stands rather than a guess.
 */
export function formatShillings(usd: number, rate: number | null) {
  return rate === null ? formatUsd(usd) : formatLocal(usd * rate);
}

/**
 * The same lead, for a figure that was already added up in shillings.
 *
 * `formatShillings` takes dollars and multiplies once, which is right when the
 * dollar figure is the real one. It is wrong for a total that came out of
 * `sumShillings`: dividing that back into dollars only to multiply it by the
 * same rate reintroduces, per row, exactly the drift that summing in shillings
 * was there to avoid.
 *
 * So this takes both — the exact shilling total, and the dollar total to fall
 * back on when no rate is published and there is nothing honest to convert
 * with. Same decision as `formatShillings`, made in the same place, so the two
 * can never disagree about which currency leads.
 */
export function formatShillingTotal(
  shillings: number,
  usd: number,
  rate: number | null
) {
  return rate === null ? formatUsd(usd) : formatLocal(shillings);
}
