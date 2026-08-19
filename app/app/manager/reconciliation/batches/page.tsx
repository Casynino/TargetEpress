import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, CircleDot, Flag, MessageCircleQuestion, Search as SearchIcon, Undo2, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ReconcileNav } from "@/components/app/reconcile-nav";
import { ReviewActions } from "@/components/app/review-actions";
import { reviewHistory, reviewsFor } from "@/lib/control";
import { formatRelative } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings } from "@/lib/money";
import { profitByDispatch } from "@/lib/profit";
import { can } from "@/lib/rbac";
import { toNumber } from "@/lib/format";
import { reconciliationTabCounts, type QueueState } from "@/lib/reconciliation-workspace";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Flight figures" };

const STATE_STYLE: Record<QueueState, { label: string; chip: string; icon: LucideIcon }> = {
  PENDING: { label: "Pending", chip: "border-warning/40 bg-warning/10 text-warning", icon: CircleDot },
  MISMATCH: { label: "Mismatch", chip: "border-destructive/40 bg-destructive/10 text-destructive", icon: AlertTriangle },
  SENT_BACK: { label: "Sent back", chip: "border-warning/40 bg-warning/10 text-warning", icon: Undo2 },
  FLAGGED: { label: "Flagged", chip: "border-destructive/40 bg-destructive/10 text-destructive", icon: Flag },
  INFO_REQUESTED: { label: "Information requested", chip: "border-info/40 bg-info/10 text-info", icon: MessageCircleQuestion },
  UNDER_REVIEW: { label: "Under review", chip: "border-brand/40 bg-brand/10 text-brand", icon: SearchIcon },
  RECONCILED: { label: "Reconciled", chip: "border-success/40 bg-success/10 text-success", icon: BadgeCheck },
};

function StateChip({ state, locale }: { state: QueueState; locale: Locale }) {
  const meta = STATE_STYLE[state];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", meta.chip)}>
      <Icon className="h-3 w-3" />
      {t(locale, meta.label)}
    </span>
  );
}

/**
 * WHAT EACH FLIGHT MADE, AND WHETHER THE MANAGER AGREES.
 *
 * A flight is the unit this business earns in, so its figures get a verdict of
 * their own — the same append-only ManagerReview the records carry, against a
 * BATCH instead of a line. The list is one row per flight and the verdict is
 * one panel underneath: three buttons per row down a table was the arrangement
 * the owner threw out, and he was right — it read as nine decisions when there
 * are three flights.
 */
export default async function ReconciliationBatches({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const params = await searchParams;
  const canReview = can(user.role, "record.review");

  const [batches, rateRow] = await Promise.all([profitByDispatch(10), currentRate()]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const shillings = (usd: number) => formatShillings(usd, rate);

  const batchStandings = await reviewsFor("BATCH", batches.map((batch) => batch.id));
  const selectedBatch = params.batch
    ? batches.find((batch) => batch.id === params.batch) ?? null
    : null;
  const batchHistory = selectedBatch ? await reviewHistory("BATCH", selectedBatch.id) : [];
  const waiting = batches.filter((batch) => !batchStandings.get(batch.id)).length;

  const withParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return `/app/manager/reconciliation/batches${query ? `?${query}` : ""}`;
  };

  const tabCounts = await reconciliationTabCounts();

  return (
    <>
      <PageHeader
        title={t(locale, "Flight figures")}
        description={t(
          locale,
          "What each flight billed, collected and cost — and your verdict on it."
        )}
      />
      <ReconcileNav counts={tabCounts} />

        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="hidden border-b bg-muted/20 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] sm:gap-3">
          <span>{t(locale, "Flight")}</span>
          <span className="text-right">{t(locale, "Billed")}</span>
          <span className="text-right">{t(locale, "Collected")}</span>
          <span className="text-right">{t(locale, "Still owed")}</span>
          <span className="text-right">{t(locale, "Costs")}</span>
        </div>

        <ul className="divide-y">
          {batches.map((batch) => {
            const standing = batchStandings.get(batch.id);
            const state = (standing?.state as QueueState) ?? "PENDING";
            const active = selectedBatch?.id === batch.id;
            return (
              <li key={batch.id}>
                <Link
                  href={withParams({ batch: active ? undefined : batch.id })}
                  scroll={false}
                  className={cn(
                    "focus-ring block border-l-2 px-4 py-2.5 transition-colors hover:bg-muted/40",
                    active ? "border-l-brand bg-brand/[0.06]" : "border-l-transparent"
                  )}
                >
                  <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] sm:items-baseline sm:gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {batch.batchNumber}
                      {state === "PENDING" ? null : (
                        <StateChip state={state} locale={locale} />
                      )}
                    </span>
                    <span className="font-mono text-xs tabular-nums sm:text-right">
                      <span className="mr-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                        {t(locale, "Billed")}
                      </span>
                      {shillings(batch.revenue)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-success sm:text-right">
                      <span className="mr-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                        {t(locale, "Collected")}
                      </span>
                      {shillings(batch.collected)}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums sm:text-right",
                        batch.outstanding > 0 ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      <span className="mr-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                        {t(locale, "Still owed")}
                      </span>
                      {shillings(batch.outstanding)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-destructive sm:text-right">
                      <span className="mr-1 text-[10px] uppercase text-muted-foreground sm:hidden">
                        {t(locale, "Costs")}
                      </span>
                      {shillings(batch.costs)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* The verdict on the one he picked, once. */}
        {selectedBatch ? (
          <div className="border-t bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {selectedBatch.batchNumber}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {shillings(selectedBatch.revenue)} {t(locale, "billed")} ·{" "}
                  {shillings(selectedBatch.collected)} {t(locale, "collected")} ·{" "}
                  {shillings(selectedBatch.outstanding)} {t(locale, "still owed")}
                </span>
              </p>
              {batchHistory.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t(locale, "Last said")}: {t(locale, STATE_STYLE[batchHistory[batchHistory.length - 1].state as QueueState]?.label ?? "")} ·{" "}
                  {formatRelative(batchHistory[batchHistory.length - 1].createdAt, locale)}
                </p>
              ) : null}
            </div>

            {canReview ? (
              <ReviewActions
                key={selectedBatch.id}
                className="mt-2"
                size="sm"
                target="BATCH"
                targetId={selectedBatch.id}
                offer={["RECONCILED", "SENT_BACK", "FLAGGED"]}
              />
            ) : null}
          </div>
        ) : (
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            {t(locale, "Pick a flight to agree its figures or hand them back.")}
          </p>
        )}
      </div>
    </>
  );
}
