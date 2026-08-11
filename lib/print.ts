/**
 * Physical sizes for the things this business prints and sticks on cargo.
 *
 * Everything here is in millimetres, because these are objects that exist:
 * a sticker has to fit on the side of a carton and a pickup slip has to fit in
 * a customer's pocket. Pixels and rems are the wrong unit for a page whose
 * whole job is to come out of a printer at a known size — a browser's default
 * root font size is not a promise, and 100mm is.
 *
 * The old print path declared no size at all. With no `@page` rule a browser
 * falls back to A4 or Letter, so every cargo label consumed a whole sheet:
 * eight boxes of cargo, eight sheets of adhesive paper, most of it blank.
 */

/**
 * 10 x 15cm — a 4 x 6in card, one per print.
 *
 * The owner's size, and the one the whole courier trade runs on: it is what
 * every thermal label roll and every fanfold box is cut to, so the stock is
 * buyable anywhere and a printer does not have to be told about it.
 *
 * Both documents use it. A warehouse that stocks one media size and prints
 * everything on it never runs the wrong roll, and the pickup slip a customer
 * carries is then the same object as the sticker on their box.
 */
export const LABEL_MM = { width: 100, height: 150 } as const;

/** The pickup slip prints on the same 10 x 15cm card as the labels. */
export const SLIP_MM = LABEL_MM;

/**
 * How the job is going to the printer.
 *
 *  - `direct` — a label printer or an A6 tray: one item per page, page cut to
 *    the item. No waste, nothing to guillotine.
 *  - `sheet`  — plain A4 adhesive stock or an office printer: items tile, and
 *    the hairline border on each is the cut line.
 *
 * Both exist because a Guangzhou packing bench and a Dar finance desk do not
 * own the same hardware, and neither should be told to buy some.
 */
export type PrintFormat = "direct" | "sheet";

export function printFormatFrom(value: string | undefined): PrintFormat {
  return value === "sheet" ? "sheet" : "direct";
}

/** A4 minus the margin the sheet layouts reserve, so the grids are checkable. */
const A4 = { width: 210, height: 297 } as const;

/**
 * The `@page` rule for a run, as CSS text.
 *
 * A page size cannot be switched by a class — `@page` is a document-level
 * at-rule, not a selector — so the rule itself is what changes, and each print
 * route renders exactly one of these.
 */
export function pageRule(format: PrintFormat, item: { width: number; height: number }) {
  if (format === "sheet") {
    return `@page { size: A4; margin: ${SHEET_MARGIN_MM}mm; }`;
  }
  // Margin zero: the page IS the label. Padding inside the item keeps ink off
  // the very edge, where a thermal head and a guillotine both get unreliable.
  return `@page { size: ${item.width}mm ${item.height}mm; margin: 0; }`;
}

/**
 * The sheet margin. Fixed, and chosen to leave slack rather than to fit exactly.
 *
 * This used to be derived — halve whatever A4 had left over — which for two
 * 100mm labels produced exactly 5mm and therefore exactly 200mm of container
 * for exactly 200mm of label. Zero slack on the main axis of a flex-wrap row is
 * a coin toss: one sub-pixel of rounding, one border resolved up, and the
 * second label wraps. The sheet then prints one column, half the adhesive stock
 * blank, while the screen still promises eight.
 *
 * 4mm leaves 2mm of slack across two labels and 9mm down four, and stays inside
 * the unprintable edge every office laser reserves.
 */
const SHEET_MARGIN_MM = 4;

/** How many items a sheet holds, for the "N per sheet" hint on screen. */
export function perSheet(item: { width: number; height: number }) {
  const usableW = A4.width - SHEET_MARGIN_MM * 2;
  const usableH = A4.height - SHEET_MARGIN_MM * 2;
  const cols = Math.max(1, Math.floor(usableW / item.width));
  const rows = Math.max(1, Math.floor(usableH / item.height));
  return { cols, rows, total: cols * rows };
}

/**
 * Slack left over once the items are laid out, in millimetres.
 *
 * Exported so the arithmetic can be asserted rather than eyeballed: if either
 * axis ever comes back at or below zero, the sheet silently prints fewer items
 * per page than the screen claims.
 */
export function sheetSlack(item: { width: number; height: number }) {
  const { cols, rows } = perSheet(item);
  return {
    width: A4.width - SHEET_MARGIN_MM * 2 - cols * item.width,
    height: A4.height - SHEET_MARGIN_MM * 2 - rows * item.height,
  };
}
