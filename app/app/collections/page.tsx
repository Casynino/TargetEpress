import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Clock,
  HandCoins,
  QrCode,
  SendHorizontal,
  Wallet,
} from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { KpiCard } from "@/components/app/kpi-card";
import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { WorkList, type WorkItem } from "@/components/app/work-list";
import { Badge } from "@/components/ui/badge";
import { collectionsOverview, submissionQueue } from "@/lib/collections";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Collections" };

/**
 * The collections desk's home.
 *
 * Customer Support chases money and never holds it, so every figure here is
 * about a CUSTOMER's obligation — what they owe, what they say they have sent,
 * what Finance has agreed. Nothing about the company's own accounts appears,
 * which is the whole reason this is a workspace of its own rather than a corner
 * of the ledger.
 *
 * Work first, as everywhere else in this app: what is waiting on this desk,
 * then the position, then the trail.
 */
export default async function CollectionsHome() {
  await requirePermission("collections.view");

  const [stats, pending, recent, rateRow] = await Promise.all([
    collectionsOverview(),
    submissionQueue("PENDING", 5),
    submissionQueue(null, 8),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const jobs: WorkItem[] = [
    {
      when: stats.awaitingPayment > 0,
      label: `${stats.awaitingPayment} bill${stats.awaitingPayment === 1 ? "" : "s"} sent, not paid`,
      detail:
        "The customer has been told what they owe and the money has not arrived. This is the call list.",
      usd: stats.outstandingUsd,
      href: "/app/collections/pending",
      cta: "Chase",
      urgent: true,
    },
    {
      when: stats.rejected > 0,
      label: `${stats.rejected} sent back by Finance`,
      detail:
        "Finance could not verify these. The customer needs ringing before they can go up again.",
      href: "/app/collections/submissions?status=REJECTED",
      cta: "See why",
      aside: "needs a call",
      urgent: true,
    },
    {
      when: stats.pendingCount > 0,
      label: `${stats.pendingCount} with Finance`,
      detail:
        "Handed up and waiting to be checked. Nothing for this desk to do but watch.",
      href: "/app/collections/submissions?status=PENDING",
      cta: "Track",
      aside: "waiting on Finance",
    },
    {
      when: stats.notesReady > 0,
      label: `${stats.notesReady} pickup note${stats.notesReady === 1 ? "" : "s"} ready`,
      detail:
        "Verified and released. Tell the customer their cargo can be collected.",
      href: "/app/finance/pickup-notes",
      cta: "Print",
      aside: "cleared",
    },
  ].filter((job) => job.when) as WorkItem[];

  return (
    <>
      <PageHeader
        title="Collections"
        description="Chasing what customers owe, collecting their proof, and handing it to Finance. No money is held or approved on this desk."
      />

      <CollectionsNav />

      <SectionLabel count={jobs.length}>Needs your attention</SectionLabel>
      <WorkList
        items={jobs}
        rate={rate}
        empty="Nothing is waiting on you. Every bill sent is settled, nothing has been sent back, and no claim is outstanding."
      />

      <div className="mt-7">
        <SectionLabel action={{ href: "/app/collections/pending", label: "The call list" }}>
          What customers owe
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MoneyTile
            label="Outstanding"
            usd={stats.outstandingUsd}
            rate={rate}
            icon={Wallet}
            tone={stats.outstandingUsd > 0 ? "warn" : "good"}
            count={`${stats.owingCount} unsettled bill${stats.owingCount === 1 ? "" : "s"}`}
            hint="Confirmed and raised. Drafts are not here — this desk cannot chase a price Finance has not signed off."
            href="/app/collections/pending"
          />
          {/* A count, not a total. Customers pay in shillings and dollars and
              these rows are stored in whatever arrived, so adding them
              together produces a figure in no currency at all. */}
          <KpiCard
            label="Waiting on Finance"
            numeric={stats.pendingCount}
            hint="What customers say they have sent, handed up and not yet checked"
            icon={Clock}
            tone={stats.pendingCount > 0 ? "warning" : "brand"}
            href="/app/collections/submissions?status=PENDING"
          />
          <KpiCard
            label="Verified today"
            numeric={stats.verifiedToday}
            hint={
              stats.todaysValue > 0
                ? `TSh ${Math.round(stats.todaysValue).toLocaleString("en-US")} cleared`
                : "Nothing cleared yet today"
            }
            icon={BadgeCheck}
            tone="success"
            href="/app/collections/submissions?status=VERIFIED"
          />
          <KpiCard
            label="Claims that stood up"
            numeric={stats.successRate ?? 0}
            suffix={stats.successRate === null ? "" : "%"}
            ringPct={stats.successRate ?? 0}
            ringLabel="Verification rate"
            hint={
              stats.successRate === null
                ? "Nothing submitted yet"
                : `${stats.submitted} handed up all told`
            }
            icon={SendHorizontal}
            tone="brand"
          />
        </div>
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
            <div>
              <h2 className="font-display font-semibold">With Finance now</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Oldest first — a claim sitting here is a customer waiting
              </p>
            </div>
            <Link
              href="/app/collections/submissions?status=PENDING"
              className="focus-ring rounded text-xs font-semibold text-brand hover:underline"
            >
              All of them →
            </Link>
          </header>
          {pending.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing is with Finance.
            </p>
          ) : (
            <ul className="divide-y">
              {pending.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/app/collections/submissions?status=PENDING#${row.submissionNumber}`}
                    className="focus-ring flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.invoice.customer.name}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {row.submissionNumber} · {row.invoice.shipment.trackingNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular">
                        {formatMoney(toNumber(row.amount), row.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelative(row.submittedAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The desk's own activity log. Not an accounting record — who did what
            and what came of it. */}
        <section className="panel overflow-hidden">
          <header className="border-b px-5 py-3.5">
            <h2 className="font-display font-semibold">Recent collections</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Everything this desk has handed up, newest first
            </p>
          </header>
          {recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing collected yet.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((row) => (
                <li key={row.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.invoice.customer.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        row.status === "VERIFIED"
                          ? "border-success/40 text-success"
                          : row.status === "REJECTED"
                            ? "border-destructive/40 text-destructive"
                            : "border-warning/40 text-warning"
                      }
                    >
                      {row.status === "PENDING"
                        ? "with Finance"
                        : row.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {row.submissionNumber} · {formatMoney(toNumber(row.amount), row.currency)}
                    {row.submittedBy ? ` · ${row.submittedBy.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
