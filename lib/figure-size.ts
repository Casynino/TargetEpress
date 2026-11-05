/**
 * A money headline that silently drops digits is worse than a smaller one.
 *
 * These headline cells are laid out as a fixed grid with overflow-hidden and
 * the figure set at a fixed size with whitespace-nowrap. The cell never grows
 * to fit, and nothing wraps or ellipsises, so the moment a shilling total is
 * long enough it simply runs under the cell's edge — reading TSh 1,096,021,5
 * where the figure is TSh 1,096,021,557, with nothing on screen to say three
 * digits are missing.
 *
 * It is not only phones. A six-column desktop row gives each figure a NARROWER
 * box than the two-column phone layout does, so the same total is cut on a
 * 1280px screen and cut worse.
 *
 * Sized by string length rather than measured, because the alternative is a
 * layout effect that reflows after paint and these rows are server-rendered.
 * Millions and a minus sign step down one notch; billions step down two, and
 * still read as the same row.
 *
 * Lived on /app/finance as a local helper, where it was written for exactly
 * this bug. Four other headline strips never got it.
 */
export function figureSize(value: string): string {
  const n = value.length;
  if (n <= 11) return "text-xl 2xl:text-2xl";
  if (n <= 14) return "text-lg 2xl:text-xl";
  if (n <= 17) return "text-base 2xl:text-lg";
  return "text-sm 2xl:text-base";
}

/** The same scale one notch down, for strips that set their figures smaller. */
export function figureSizeSmall(value: string): string {
  const n = value.length;
  if (n <= 11) return "text-lg";
  if (n <= 14) return "text-base";
  if (n <= 17) return "text-sm";
  return "text-xs";
}

/**
 * A figure's size measured against its own box rather than guessed from its
 * length: its cap, or smaller when the column is too narrow to hold it at the
 * cap. In container units, so the nearest ancestor must be a size container
 * (`[container-type:inline-size]`). Digits and separators average under 0.6em
 * in this face, so 0.6 per character keeps the whole figure inside.
 */
export function fitFigure(text: string, capPx: number) {
  return `min(${capPx}px, calc(100cqi / ${(0.6 * Math.max(text.length, 1)).toFixed(2)}))`;
}
