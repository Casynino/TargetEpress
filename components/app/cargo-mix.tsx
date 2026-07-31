import Link from "next/link";

import { cn } from "@/lib/utils";

export type MixSlice = {
  name: string;
  shipments: number;
  weightKg: number;
};

/**
 * What this desk actually handles.
 *
 * The rest of the dashboard counts cargo; nothing on it says *what* the cargo
 * is. That is the question behind half the decisions made at a warehouse desk —
 * which rate card gets used most, what to keep packing material for, whether
 * this month looks like last month — and it is not answerable from a row of
 * totals.
 *
 * A donut rather than a bar chart because the useful reading is a share, not a
 * comparison of magnitudes: "electronics is a third of what we send" is the
 * sentence someone repeats afterwards.
 */
const TONES = [
  "hsl(var(--brand))",
  "hsl(var(--info))",
  "hsl(var(--signal))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--muted-foreground))",
];

/**
 * Cargo nobody chose an item for.
 *
 * It is not a kind of goods, so it never takes a colour from the rotation —
 * a grey wedge reads as "missing", which is what it is. When it is large the
 * chart is telling you something more useful than the mix: Finance is about to
 * price most of this month on the general rate.
 */
const UNCLASSIFIED = "Not classified";
const UNCLASSIFIED_TONE = "hsl(var(--muted-foreground) / 0.35)";

function toneFor(name: string, index: number) {
  if (name === UNCLASSIFIED) return UNCLASSIFIED_TONE;
  return TONES[index % TONES.length];
}

export function CargoMix({
  slices,
  totalShipments,
  totalWeightKg,
  periodLabel,
}: {
  /** Already sorted, biggest first, with the tail collapsed into "Other". */
  slices: MixSlice[];
  totalShipments: number;
  totalWeightKg: number;
  periodLabel: string;
}) {
  if (totalShipments === 0) {
    return (
      <section className="panel flex flex-col p-5">
        <h2 className="font-display font-semibold">What you are sending</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing received yet in this period.
        </p>
      </section>
    );
  }

  // Geometry for a stroke-drawn donut. Drawing arcs with dash offsets rather
  // than paths keeps this to one element per slice and no trigonometry.
  const unclassified =
    slices.find((slice) => slice.name === UNCLASSIFIED)?.shipments ?? 0;

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = slices.map((slice, index) => {
    const share = slice.shipments / totalShipments;
    const arc = {
      key: slice.name,
      colour: toneFor(slice.name, index),
      dash: share * circumference,
      offset,
      share,
    };
    offset += arc.dash;
    return arc;
  });

  return (
    <section className="panel flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold">What you are sending</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground tabular">
          {totalWeightKg.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{" "}
          kg
        </p>
      </div>

      <div className="flex items-center justify-center py-2">
        <div className="relative">
          <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="16"
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={arc.colour}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                // A hairline gap so neighbouring slices stay distinct even when
                // two of the tones are close in value.
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold leading-none tabular">
              {totalShipments.toLocaleString()}
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">
              shipments
            </span>
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {slices.map((slice, index) => {
          const share = Math.round((slice.shipments / totalShipments) * 100);
          return (
            <li
              key={slice.name}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: toneFor(slice.name, index) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {slice.shipments}
              </span>
              <span
                className={cn(
                  "w-9 shrink-0 text-right text-xs font-medium tabular",
                  share >= 25 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {share}%
              </span>
            </li>
          );
        })}
      </ul>

      {unclassified > 0 ? (
        <Link
          href="/app/batches"
          className="mt-4 block rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs transition-colors hover:bg-warning/10"
        >
          <span className="font-medium text-warning">
            {unclassified} without an item chosen
          </span>
          <span className="mt-0.5 block text-muted-foreground">
            Finance prices these on the general rate, which is usually wrong.
          </span>
        </Link>
      ) : (
        <Link
          href="/app/shipments"
          className="mt-4 text-xs font-medium text-brand hover:underline"
        >
          All shipments →
        </Link>
      )}
    </section>
  );
}
