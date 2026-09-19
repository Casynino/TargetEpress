import Link from "next/link";
import type { Role } from "@prisma/client";
import { PackagePlus, ScanLine } from "lucide-react";

import { CargoSearch } from "@/components/app/cargo-search";
import { DualClock } from "@/components/app/dual-clock";
import { ROLE_LABELS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { viewerLocale } from "@/lib/viewer";

/**
 * The identity band an office desk opens on: today, who you are, your name,
 * the search box, and the two things you can start the day with.
 *
 * Lifted out of the dashboard, where it was inline markup, because the manager
 * runs the same business off the same numbers and was the only person in the
 * company being handed a plain title bar to do it from. Copying the band into
 * their page would have made the owner's greeting and the manager's greeting
 * two things that merely look alike until someone edits one of them.
 *
 * The warehouses keep their own banner (components/app/warehouse-hero) rather
 * than sharing this one: their quick action and their greeting differ. Both
 * carry the two cities' clocks now, as one short line — cargo on every desk
 * starts in Guangzhou.
 *
 * The role chip and the quick actions are DERIVED from `role`, not passed in.
 * They are two readings of the same fact — what this person is, and what that
 * lets them press — and two props could be handed values that disagree, which
 * would put a "Finance" label above a receiving button or the reverse.
 */
export async function DeskHero({
  firstName,
  role,
  today,
  subtitle,
  search,
}: {
  firstName: string;
  role: Role;
  /** Today, already formatted for the reader's calendar by the page. */
  today: string;
  /** What this desk is for, in English; translated here. */
  subtitle: string;
  /** Where the search box posts. Support has its own; everyone else /app/search. */
  search: { action: string };
}) {
  const locale = await viewerLocale();

  return (
    /* The desk's own colours, not a stock gradient: the red comes off the
       Target mark and the blue is what the app uses for anything you can
       act on. The hairline grid over the top keeps it reading as freight
       software rather than a marketing banner.

       COMPACT, as the owner asked — the size of Swift's banner: one short line
       for the day, the desk and both clocks, a smaller greeting, the slim
       search box and small round actions. It used to fill most of a phone
       screen before a single figure showed. */
    <div className="relative mb-4 overflow-hidden rounded-2xl">
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
            {today} ·{" "}
            <span className="font-semibold uppercase tracking-wider text-white/90">
              {t(locale, ROLE_LABELS[role])}
            </span>
          </p>
          <DualClock inline emphasis="TZ" />
        </div>
        <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
          {t(locale, "Habari,")} {firstName}
        </h1>
        <p className="mt-0.5 hidden text-sm text-white/75 sm:block">{t(locale, subtitle)}</p>
        {/* The same box the support desk opens on. Every desk that is not
            holding the box finds one this way — a customer reads out a
            number and it has to go somewhere without hunting for a page
            first. Posts to /app/search rather than the support desk's own
            search, which is gated on ticket.manage. */}
        <div className="mt-3 max-w-2xl">
          <CargoSearch action={search.action} compact />
        </div>
        {/* Quick actions, offered only where the role actually does them.
            Styled against the gradient rather than the page, or a solid
            button sits on it like a sticker. */}
        {can(role, "shipment.create") || can(role, "shipment.release") ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {can(role, "shipment.create") ? (
              <Link
                href="/app/cargo/new"
                className="focus-ring inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
              >
                <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                {t(locale, "Receive cargo")}
              </Link>
            ) : null}
            {can(role, "shipment.release") ? (
              <Link
                href="/app/release"
                className={
                  can(role, "shipment.create")
                    ? "focus-ring inline-flex h-8 items-center rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                    : "focus-ring inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
                }
              >
                <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                {t(locale, "Scan & release")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
