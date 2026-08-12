import Link from "next/link";
import { PackagePlus, type LucideIcon } from "lucide-react";

import { CargoSearch } from "@/components/app/cargo-search";
import { DualClock } from "@/components/app/dual-clock";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

/**
 * One of the three headline numbers under the greeting.
 *
 * `sub` is how a chip carries two facts without becoming two tiles — the
 * standing total above, today's movement against it below. Three tiles is the
 * ceiling here; a banner that grows a fourth row stops being a banner.
 */
export type HeroChip = {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Where the number goes when pressed. Omit for a figure with no list behind it. */
  href?: string;
};

/**
 * The first thing the warehouse sees.
 *
 * A greeting, the time in both countries, and today's three numbers. It is the
 * only part of the page that is about the person rather than the cargo, and it
 * earns its space by answering "how is today going" before anyone scrolls.
 *
 * The greeting follows the reader's own clock, not the server's — a Guangzhou
 * desk at 9am should not be told good evening because the host is in Virginia.
 *
 * The chips and the call to action are passed in rather than derived here: the
 * two warehouses do different work, and a Dar desk being shown China's
 * registration count under "here is what is happening today" is a lie told in
 * a nice box.
 */
export async function WarehouseHero({
  firstName,
  warehouseName,
  emphasis,
  action,
  search,
  hourOfDay,
}: {
  firstName: string;
  warehouseName: string;
  emphasis: "CN" | "TZ";
  /** The one thing this desk starts its day with. */
  action: { href: string; label: string };
  /**
   * Where the search box posts. Omit and no box is drawn.
   *
   * The floor is asked "where is my cargo" all day, same as every other desk,
   * and the answer starts by typing a number somewhere. It sits in the banner
   * rather than below the fold because a person on the phone should not have
   * to find a page first.
   */
  search?: { action: string };
  /** Local hour at the warehouse, computed on the server for that zone. */
  hourOfDay: number;
}) {
  const locale = await viewerLocale();
  const greeting = t(
    locale,
    hourOfDay < 12 ? "Good morning" : hourOfDay < 17 ? "Good afternoon" : "Good evening"
  );

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl">
      {/* The same band the money desk gets, so every department opens onto the
          same thing. Target's own colours: the red off the mark running into
          the blue the app uses for anything you can act on. Nothing moves —
          this page is read a hundred times a day and animation on it becomes
          wallpaper by lunchtime. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-signal via-brand to-info"
      />
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5"
      />

      <div className="relative p-6">
        {/*
          Two blocks that stack on a phone and sit side by side from `sm`.

          They were both flex children with no width floor, so on a 375px screen
          the clocks and the scan button — which need about 300px between them —
          took what they wanted and left the greeting roughly forty pixels to
          live in. `flex-1` shrinks; it does not wrap. The result was a heading
          reading one word per line down the middle of the phone, which is what
          the warehouse actually sees every morning.

          `w-full` below `sm` forces the wrap instead of the squeeze.
        */}
        <div className="flex flex-wrap items-start justify-between gap-5 sm:gap-6">
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
              {t(locale, warehouseName)}
            </span>
            <h1 className="mt-3 font-display text-[26px] font-bold leading-tight tracking-tight text-white sm:text-[32px] sm:leading-none">
              {greeting}, {firstName}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {t(locale, "Here is what is happening on the floor today.")}
            </p>
            {search ? (
              <div className="mt-4 max-w-2xl">
                <CargoSearch action={search.action} />
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-4 sm:w-auto sm:justify-start sm:gap-5">
            <DualClock emphasis={emphasis} />
            <Link
              href={action.href}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand shadow-lift transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              <PackagePlus className="h-4 w-4" />
              {t(locale, action.label)}
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}

/**
 * The floor's standing numbers, under the quick actions rather than in the
 * banner.
 *
 * They were three glass tiles on the gradient, which put the least urgent
 * figures on the page in the most prominent place — the weight on the floor
 * does not change what anybody does next, and it was sitting above the buttons
 * that do. The banner is now the greeting and the search box; these keep their
 * meaning and lose the top billing.
 *
 * Styled for the page, not the gradient: on the dark background white-on-white
 * would simply be gone.
 */
export function FloorChips({ chips }: { chips: HeroChip[] }) {
  if (chips.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {chips.map((chip) => {
        const body = (
          <>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <chip.icon className="h-3.5 w-3.5" />
              {chip.label}
            </dt>
            <dd className="mt-1 font-display text-xl font-bold tabular">
              {chip.value}
            </dd>
            {chip.sub ? (
              <p className="mt-0.5 text-xs tabular text-muted-foreground">
                {chip.sub}
              </p>
            ) : null}
          </>
        );

        // A number somebody wants to act on is the way through to the list
        // behind it. Chips with nothing to open stay plain rather than
        // pretending to be pressable.
        return chip.href ? (
          <Link
            key={chip.label}
            href={chip.href}
            className="focus-ring rounded-xl border bg-card p-3 transition-colors hover:border-brand/40"
          >
            {body}
          </Link>
        ) : (
          <div key={chip.label} className="rounded-xl border bg-card p-3">
            {body}
          </div>
        );
      })}
    </dl>
  );
}
