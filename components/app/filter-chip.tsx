import Link from "next/link";

/**
 * A FILTER, WHICH IS NOT A TAB.
 *
 * Tabs and filter chips were drawn with the same formula — the same pill, the
 * same brand fill when selected — so a page carrying both showed two rows of
 * identical pills, and on some of them the ONLY brand pill on screen was a
 * filter sitting under an unlit tab row. The reader is asked "where am I" and
 * answered by the wrong control.
 *
 * Navigation keeps the brand fill, because moving between tabs moves the
 * reader. A filter narrows one list on the page they are already on, so it
 * says so quietly: an outlined, foreground-coloured pill that reads as chosen
 * without claiming to be a destination.
 */
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-foreground/40 bg-accent text-foreground"
          : "border-transparent bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
