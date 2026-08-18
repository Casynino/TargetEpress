import Link from "next/link";
import type { Role } from "@prisma/client";
import { PackagePlus, ScanLine } from "lucide-react";

import { CargoSearch } from "@/components/app/cargo-search";
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
 * than sharing this one: a floor supervisor needs both countries' clocks and
 * today's boxes, and Finance does not care what time it is in Guangzhou.
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
       software rather than a marketing banner. */
    <div className="relative mb-6 overflow-hidden rounded-2xl">
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
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
        {/* flex-1 so this column takes the width it is given. Without it the
            column shrinks to its own text and max-w-2xl on the search below
            never applies — a max is not a width, so the box came out the
            length of the greeting above it. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
              {today}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              {t(locale, ROLE_LABELS[role])}
            </span>
          </div>
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight text-white">
            {t(locale, "Habari,")} {firstName}
          </h1>
          <p className="mt-2 text-sm text-white/80">{t(locale, subtitle)}</p>
          {/* The same box the support desk opens on. Every desk that is not
              holding the box finds one this way — a customer reads out a
              number and it has to go somewhere without hunting for a page
              first. Posts to /app/search rather than the support desk's own
              search, which is gated on ticket.manage. */}
          <div className="mt-4 max-w-2xl">
            <CargoSearch action={search.action} />
          </div>
        </div>
        {/* Quick actions, offered only where the role actually does them.
            Styled against the gradient rather than the page, or a solid
            button sits on it like a sticker. */}
        <div className="flex flex-wrap gap-2">
          {can(role, "shipment.create") ? (
            <Link
              href="/app/cargo/new"
              className="focus-ring inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
            >
              <PackagePlus className="mr-2 h-4 w-4" />
              {t(locale, "Receive cargo")}
            </Link>
          ) : null}
          {can(role, "shipment.release") ? (
            <Link
              href="/app/release"
              className={
                can(role, "shipment.create")
                  ? "focus-ring inline-flex items-center rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                  : "focus-ring inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
              }
            >
              <ScanLine className="mr-2 h-4 w-4" />
              {t(locale, "Scan & release")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
