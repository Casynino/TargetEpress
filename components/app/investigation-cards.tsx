import {
  AlertTriangle,
  Archive,
  Coins,
  PackageOpen,
  PackageSearch,
  PackageX,
  type LucideIcon,
} from "lucide-react";

import { StatCard } from "@/components/app/stat-card";
import type { ExceptionGroupKey } from "@/components/app/exception-card";
import { t } from "@/lib/i18n";
import type { InvestigationCounts, QueueSet } from "@/lib/investigation-queue";
import { viewerLocale } from "@/lib/viewer";

/**
 * The six cards the spec names, above the queue.
 *
 * Each one is a filter, not an ornament. Pressing "Damaged cargo" puts the
 * damaged cases in the table below and lights the card, so the number and the
 * list can never disagree about what is being counted — the number came from a
 * `count()` and the list came from a `findMany()` with the same `where`.
 *
 * Two of them go looking at the type (missing, damaged) and three at the set of
 * cases (found, compensation, closed), which is why the two live in separate
 * query params: "damaged cases where the cargo was later found" is a question
 * somebody will eventually want to ask, and this shape can answer it.
 */

type CardKey =
  | "open"
  | "missing"
  | "damaged"
  | "found"
  | "compensation"
  | "closed";

type CardSpec = {
  key: CardKey;
  label: string;
  icon: LucideIcon;
  /** Colour when the number is above zero. Zero is always calm. */
  alertTone: "danger" | "warning" | "success" | "brand" | "neutral";
  hint: string;
  /** Where the card points, expressed as the filter it selects. */
  set: QueueSet;
  group: ExceptionGroupKey | "all";
};

const CARDS: CardSpec[] = [
  {
    key: "open",
    label: "Open cases",
    icon: AlertTriangle,
    alertTone: "danger",
    hint: "Everything nobody has finished with",
    set: "open",
    group: "all",
  },
  {
    key: "missing",
    label: "Missing cargo",
    icon: PackageX,
    alertTone: "danger",
    hint: "Short or nothing came off the plane",
    set: "open",
    group: "missing",
  },
  {
    key: "damaged",
    label: "Damaged cargo",
    icon: PackageOpen,
    alertTone: "warning",
    hint: "Arrived, but not in one piece",
    set: "open",
    group: "damaged",
  },
  {
    key: "found",
    label: "Cargo found",
    icon: PackageSearch,
    alertTone: "success",
    hint: "Turned up and back in the warehouse",
    set: "found",
    group: "all",
  },
  {
    key: "compensation",
    label: "Compensation pending",
    icon: Coins,
    alertTone: "warning",
    // A count, never a figure — the warehouse needs to know a case is waiting
    // on Finance without ever seeing what it is worth.
    hint: "Approved payouts Finance has not paid",
    set: "compensation",
    group: "all",
  },
  {
    key: "closed",
    label: "Closed cases",
    icon: Archive,
    alertTone: "neutral",
    hint: "Signed off, kept on the record",
    set: "closed",
    group: "all",
  },
];

export async function InvestigationCards({
  counts,
  set,
  group,
  tracking,
}: {
  counts: InvestigationCounts;
  set: QueueSet;
  group: ExceptionGroupKey | "all";
  tracking: string;
}) {
  // The card copy above lives in English so the spec stays readable at the
  // definition; it is translated here, at the one place it is rendered.
  const locale = await viewerLocale();

  const value: Record<CardKey, number> = {
    open: counts.open,
    missing: counts.missing,
    damaged: counts.damaged,
    found: counts.found,
    compensation: counts.compensationPending,
    closed: counts.closed,
  };

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {CARDS.map((card) => {
        const count = value[card.key];
        const active = card.set === set && card.group === group;

        const query = new URLSearchParams();
        if (card.set !== "open") query.set("set", card.set);
        if (card.group !== "all") query.set("group", card.group);
        if (tracking) query.set("tracking", tracking);
        const search = query.toString();

        return (
          <div
            key={card.key}
            className={
              active
                ? "rounded-xl ring-2 ring-brand ring-offset-2 ring-offset-background"
                : undefined
            }
          >
            <StatCard
              label={t(locale, card.label)}
              value={count}
              hint={t(locale, card.hint)}
              icon={card.icon}
              tone={count > 0 ? card.alertTone : "neutral"}
              href={search ? `/app/exceptions?${search}` : "/app/exceptions"}
            />
          </div>
        );
      })}
    </div>
  );
}
