import Link from "next/link";
import { PackagePlus, type LucideIcon } from "lucide-react";

import { CargoSearch } from "@/components/app/cargo-search";
import { BANNER_ACTION_MAIN } from "@/components/app/desk-hero";
import { PageBanner } from "@/components/app/page-banner";
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
 * The small banner with the warehouse's name and a greeting, then the search
 * box and the day's one action just under it. It is the only part of the page
 * that is about the person rather than the cargo.
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
  action,
  search,
  hourOfDay,
}: {
  firstName: string;
  /** Already translated, and short enough for the banner's wide letters. */
  warehouseName: string;
  /** The one thing this desk starts its day with, when the row of actions
      under the banner does not already carry it — the same button twice,
      one above the other, is what the owner asked to be rid of. */
  action?: { href: string; label: string };
  /**
   * Where the search box posts. Omit and no box is drawn.
   *
   * The floor is asked "where is my cargo" all day, same as every other desk,
   * and the answer starts by typing a number somewhere. It sits right under
   * the banner rather than below the fold because a person on the phone
   * should not have to find a page first.
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
    <>
      {/* The small banner every desk opens on (components/app/page-banner);
          the two cities' clocks are in the top bar now. */}
      <PageBanner title={warehouseName} line={`${greeting}, ${firstName}`} />
      {search || action ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {search ? (
            <div className="min-w-0 flex-1 sm:max-w-xl">
              <CargoSearch action={search.action} compact />
            </div>
          ) : null}
          {action ? (
            <Link href={action.href} className={BANNER_ACTION_MAIN}>
              <PackagePlus className="h-3.5 w-3.5" />
              {t(locale, action.label)}
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
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
    /* Four sit two by two on a phone and in one row on a wide screen; three
       keep their row of three. */
    <dl
      className={`grid grid-cols-2 gap-3 ${chips.length === 4 ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}
    >
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
