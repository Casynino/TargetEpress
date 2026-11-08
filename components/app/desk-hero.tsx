import Link from "next/link";
import type { Role } from "@prisma/client";
import { PackagePlus, ScanLine } from "lucide-react";

import { CargoSearch } from "@/components/app/cargo-search";
import { PageBanner, bannerDate } from "@/components/app/page-banner";
import { ROLE_LABELS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { viewerLocale } from "@/lib/viewer";

/** A small round button under a banner: the desk's first move of the day. */
const BANNER_ACTION =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors";
export const BANNER_ACTION_MAIN = `${BANNER_ACTION} bg-brand text-brand-foreground hover:bg-brand/90`;
export const BANNER_ACTION_SECOND = `${BANNER_ACTION} border bg-card text-foreground hover:bg-accent`;

/**
 * What an office desk opens on: the small banner with the desk's name and the
 * date, then the search box and the things this person can start the day
 * with, just under it.
 *
 * Shared by every office desk and the manager, so their banners cannot drift
 * into two things that merely look alike. The warehouses keep their own
 * (components/app/warehouse-hero): their date follows the floor's calendar,
 * they carry both cities' clocks, and their one action differs.
 *
 * The desk's name and the quick actions are DERIVED from `role`, not passed
 * in. They are two readings of the same fact — what this person is, and what
 * that lets them press — and two props could be handed values that disagree.
 */
export async function DeskHero({
  role,
  search,
}: {
  role: Role;
  /** Where the search box posts. Support has its own; everyone else /app/search. */
  search: { action: string };
}) {
  const locale = await viewerLocale();

  return (
    <>
      <PageBanner title={t(locale, ROLE_LABELS[role])} line={bannerDate(locale)} />
      {/* The box every desk opens on: a customer reads out a number and it has
          to go somewhere without hunting for a page first. Posts to
          /app/search rather than the support desk's own search, which is
          gated on ticket.manage. The actions are offered only where the role
          actually does them. */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-xl">
          <CargoSearch action={search.action} compact />
        </div>
        {can(role, "shipment.create") || can(role, "shipment.release") ? (
          <div className="flex flex-wrap gap-2">
            {can(role, "shipment.create") ? (
              <Link href="/app/cargo/new" className={BANNER_ACTION_MAIN}>
                <PackagePlus className="h-3.5 w-3.5" />
                {t(locale, "Receive cargo")}
              </Link>
            ) : null}
            {can(role, "shipment.release") ? (
              <Link
                href="/app/release"
                className={can(role, "shipment.create") ? BANNER_ACTION_SECOND : BANNER_ACTION_MAIN}
              >
                <ScanLine className="h-3.5 w-3.5" />
                {t(locale, "Scan & release")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
