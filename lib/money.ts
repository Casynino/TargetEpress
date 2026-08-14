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
 * A dollar figure in shillings, at a rate the caller has already chosen.
 *
 * Rounded, because the result is money somebody will hand over, and because a
 * fraction of a shilling has no physical form.
 */
export function toLocal(usd: number, rate: number): number {
  return Math.round(usd * rate);
}
