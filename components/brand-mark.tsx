import { cn } from "@/lib/utils";

/**
 * Target Express mark — a target ring with a cargo vector breaking out of it.
 * Pure SVG so it prints cleanly on labels, manifests and pickup notes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        className="stroke-brand"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        className="stroke-brand"
        strokeWidth="2.5"
        opacity="0.55"
      />
      <path
        d="M13.5 18.5 27 8.5l-5.5 15.5-3.2-6.2-5.8-1.3Z"
        className="fill-signal"
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
      <BrandMark className="h-8 w-8 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight">
          Target Express
        </span>
        {subtitle ? (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Air Cargo
          </span>
        ) : null}
      </span>
    </span>
  );
}
