"use client";

import { useT } from "@/components/app/locale-provider";

/**
 * China said this, Dar found that, and here is the gap.
 *
 * One block, used wherever the floor types a figure over Guangzhou's: the tick
 * path behind the scales icon, and the fault path behind the warning triangle.
 * A damaged carton is still weighed, so both screens ask the same question and
 * there is no reason for them to ask it in two different shapes.
 *
 * It lives in its own module rather than inside either panel. Declared inside a
 * component it would be a fresh function on every render — a different
 * component type as far as React is concerned — and the subtree would be torn
 * down and rebuilt between keystrokes, taking the focused input with it. The
 * desk gets one digit per click when that happens.
 */
export function WeighFigures({
  label,
  was,
  unit,
  delta,
  moved,
  children,
}: {
  label: string;
  was: string;
  unit: string;
  delta: number;
  moved: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("China")} {t(label)}
        </p>
        <p className="mt-1 font-display text-xl font-bold tabular-nums text-muted-foreground">
          {was} <span className="text-sm font-medium">{t(unit)}</span>
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
          {t("Dar")} {t(label)}
        </p>
        <div className="mt-1 flex items-baseline gap-1">
          {children}
          <span className="text-sm font-medium text-muted-foreground">
            {t(unit)}
          </span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("Difference")}
        </p>
        <p
          className={`mt-1 font-display text-xl font-bold tabular-nums ${
            moved ? "text-warning" : "text-muted-foreground"
          }`}
        >
          {moved ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)}` : "0"}{" "}
          <span className="text-sm font-medium">{t(unit)}</span>
        </p>
      </div>
    </div>
  );
}

/** The figure box itself, so the two panels cannot drift apart on styling. */
export const WEIGH_BOX =
  "focus-ring w-24 rounded-md border bg-background px-2 py-1 font-display text-xl font-bold tabular-nums outline-none";

/** Rounded to the hundredth, because a scale reading is not floating-point noise. */
export function gapOf(now: number, was: number) {
  return Math.round((now - was) * 100) / 100;
}
