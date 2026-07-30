import { cn } from "@/lib/utils";

/**
 * Target Express mark — a blue globe with a red aircraft sweeping across it,
 * following the company's existing logo (navy "Target", red "Express Air
 * Cargo", red plane over a blue globe).
 *
 * This is a faithful redraw, not the original artwork. When the owner supplies
 * the real logo file, drop it in `public/brand/logo.svg` and swap this out —
 * everything else keys off BrandLockup.
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
        <span className="font-display text-[16px] font-extrabold tracking-tight">
          Target
        </span>
        {subtitle ? (
          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-signal">
            Express Air Cargo
          </span>
        ) : null}
      </span>
    </span>
  );
}
