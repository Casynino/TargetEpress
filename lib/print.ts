/**
 * The card this business prints on.
 *
 * 10 x 15cm — a 4 x 6in shipping label, and the one size the courier trade
 * runs on: DHL, FedEx, UPS and every thermal roll and fanfold box are cut to
 * it, so the stock is buyable anywhere and a printer does not have to be told
 * about it.
 *
 * One size for both documents, and no choice offered. A warehouse that stocks
 * a single media size can never load the wrong roll, and the pickup slip in a
 * customer's hand is then physically the same object as the sticker on their
 * box — which matters, because the counter scans both and they have to agree.
 *
 * An A4 tiling mode used to live here for offices without a label printer. It
 * is gone: two cards to a sheet with 139mm left blank was a worse answer than
 * the problem, and offering a format nobody uses is a way to print a hundred
 * labels on the wrong one.
 *
 * Millimetres because these are objects that exist. A browser's default root
 * font size is not a promise; 100mm is.
 */
export const LABEL_MM = { width: 100, height: 150 } as const;

/** The pickup slip prints on the same card as the labels. */
export const SLIP_MM = LABEL_MM;

/**
 * The `@page` rule, as CSS text.
 *
 * A page size cannot be set by a class — `@page` is a document-level at-rule
 * that no selector reaches — so each print route renders this into the
 * document. Margin zero: the page IS the card, and the padding inside it keeps
 * ink off the very edge where a thermal head gets unreliable.
 *
 * Before this existed no page size was declared anywhere, so a browser fell
 * back to A4 and every label consumed a whole sheet of adhesive stock.
 */
export function pageRule(item: { width: number; height: number }) {
  return `@page { size: ${item.width}mm ${item.height}mm; margin: 0; }`;
}
