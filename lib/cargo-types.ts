/**
 * "OTHERS" IS THE BOTTOM OF THE PICKER, WHEREVER IT WAS ADDED.
 *
 * The Guangzhou desk's list read: … Car Accessories, General Merchandise,
 * Others, Hats, Bracelets, Fabrics, Camera (no battery). Four real choices sat
 * underneath the catch-all, which reads as though the list had ended — you pick
 * "Others" and never scroll past it.
 *
 * Ordering by sortOrder alone cannot hold this. "Others" was created on day one
 * with a low number, and every type added afterwards gets a higher one, so the
 * catch-all drifts upward every time the business learns a new kind of cargo.
 * The rule belongs in code, where a new row cannot outrank it.
 *
 * Matched on the English name because that is what the column stores; the
 * dictionary translates the label at render time, after the order is decided.
 */
const FALLBACK_TYPE = /^\s*others?\s*$/i;

/** The same list, with any catch-all entry moved to the end. Order is otherwise untouched. */
export function othersLast<T extends { name: string }>(types: T[]): T[] {
  const named = types.filter((type) => !FALLBACK_TYPE.test(type.name));
  if (named.length === types.length) return types;
  return named.concat(types.filter((type) => FALLBACK_TYPE.test(type.name)));
}
