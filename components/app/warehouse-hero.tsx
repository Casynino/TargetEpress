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
  /** The one thing this desk starts its day with, when the row of actions
      under the banner does not already carry it — the same button twice,
      one above the other, is what the owner asked to be rid of. */
  action?: { href: string; label: string };
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
    <section className="relative mb-4 overflow-hidden rounded-2xl">
      {/* The same band the money desk gets, so every department opens onto the
          same thing. Target's own colours: the red off the mark running into
          the blue the app uses for anything you can act on. Nothing moves —
          this page is read a hundred times a day and animation on it becomes
          wallpaper by lunchtime.

          Compact, the size of Swift's: the warehouse and both cities' clocks on
          one short line, a smaller greeting, the slim search box, and the
          day's one action as a small round button. */}
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

      <div className="relative px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-white/75">
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            <span className="font-semibold uppercase tracking-wider text-white/90">
              {t(locale, warehouseName)}
            </span>
          </p>
          {/* The warehouse you are standing in first. */}
          <DualClock inline emphasis={emphasis} />
        </div>
        <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-0.5 hidden text-sm text-white/75 sm:block">
          {t(locale, "Here is what is happening on the floor today.")}
        </p>
        {search ? (
          <div className="mt-3 max-w-2xl">
            <CargoSearch action={search.action} compact />
          </div>
        ) : null}
        {action ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={action.href}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              {t(locale, action.label)}
            </Link>
          </div>
        ) : null}
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
