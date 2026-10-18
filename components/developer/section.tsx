/**
 * A section of the one-page Home: a title, one short line saying what it is
 * for, and a rule under them. The page is read top to bottom, so every block
 * announces itself and nobody has to hunt for a tab.
 */
export function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border pb-2.5">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {text ? <p className="text-sm text-muted-foreground">{text}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A quiet divider between the two halves of the page: the system, then the business. */
export function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
