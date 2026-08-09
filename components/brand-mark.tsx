import { cn } from "@/lib/utils";

/**
 * Target Express mark — a navy globe with a red aircraft sweeping across it.
 *
 * A redraw, kept deliberately. The original artwork now lives at
 * public/brand/target-express-logo.png and is used wherever the full lockup
 * belongs on white — an invoice, a pickup note, a package label. It cannot be
 * used here: its "Express Air Cargo" is navy ink on transparency, which
 * disappears into the sidebar this mark spends most of its life in.
 *
 * So the redraw carries the same elements in tokens that survive both themes,
 * and the file is the reference it is drawn from rather than a thing it
 * replaces. Colours corrected against it: the wordmark is red over navy, not
 * navy over red.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-9 w-9", className)}
      aria-hidden="true"
    >
      {/* Globe */}
      <circle cx="19" cy="21" r="12" className="fill-brand/10" />
      <circle
        cx="19"
        cy="21"
        r="12"
        className="stroke-brand"
        strokeWidth="1.6"
      />
      {/* Meridians */}
      <ellipse
        cx="19"
        cy="21"
        rx="5.2"
        ry="12"
        className="stroke-brand/55"
        strokeWidth="1.1"
      />
      <path
        d="M7.4 17.2h23.2M7.4 24.8h23.2"
        className="stroke-brand/55"
        strokeWidth="1.1"
      />
      {/* Aircraft breaking out of the globe, tilted like the original */}
      <path
        d="M12 26.4 33.6 6.2l-7.1 22.5-4.6-8.1-9.9-4.2Z"
        className="fill-signal"
      />
      {/* Speed streak */}
      <path
        d="M9.6 30.6 20 24"
        className="stroke-signal"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLockup({
  className,
  subtitle = true,
}: {
  className?: string;
  subtitle?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="h-9 w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        {/*
          The colours were the wrong way round.

          The registered mark is "Target" in red over "Express Air Cargo" in
          navy — see public/brand/target-express-logo.png, which is the artwork
          itself. This lockup had the red on the second line and left the first
          in whatever the page's foreground happened to be.

          "Express Air Cargo" takes text-brand rather than a fixed navy: the
          token is the logo's navy on a light page and a legible blue on a dark
          one, and this lockup sits on both. Painting it #182A48 everywhere
          would be faithful to the file and invisible in the sidebar.
        */}
        <span className="font-display text-[16px] font-extrabold tracking-tight text-signal">
          Target
        </span>
        {subtitle ? (
          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-brand">
            Express Air Cargo
          </span>
        ) : null}
      </span>
    </span>
  );
}
