/**
 * The Developer's banner: the date in Tanzania, who is looking, and what this
 * desk is for. Violet, like the "DEVELOPER MODE" strip above it, so the two
 * read as the same account at a glance.
 */
export function DevHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-6 text-white sm:px-8 sm:py-8"
      style={{ backgroundImage: "linear-gradient(135deg, #2e1065 0%, #5b21b6 55%, #7c3aed 100%)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-white/80">
          <span>{eyebrow}</span>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            Developer
          </span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/80">{subtitle}</p>
      </div>
    </div>
  );
}
