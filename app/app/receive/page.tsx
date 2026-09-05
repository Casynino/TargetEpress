import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ClipboardCheck,
  Clock,
  Package,
  Plane,
  Warehouse,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { ReceivingQueue } from "@/components/app/receiving-queue";
import { StatStrip } from "@/components/app/stat-strip";
import { Button } from "@/components/ui/button";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { receivingQueue } from "@/lib/queries";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Receive & verify") };
}

export default async function ReceivePage() {
  await requirePermission("batch.receive");

  const locale = await viewerLocale();
  const { rows, summary } = await receivingQueue();

  /* Flights whose check-in is over. Not part of the queue — see the note by
     the section that renders them. */
  const older = await prisma.batch.findMany({
    where: { permanent: false, status: { in: ["VERIFIED", "CLOSED"] } },
    orderBy: { arrivalDate: "desc" },
    take: 12,
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      status: true,
      _count: { select: { shipments: { where: { deletedAt: null } } } },
    },
  });

  // The single most urgent batch, so the operator never has to hunt for it.
  const next = rows.find((r) => r.status === "ARRIVED" && r.unchecked > 0);
  const checkedShare =
    summary.onFloor === 0
      ? 100
      : (() => {
          const floor = rows.filter((r) => r.status === "ARRIVED");
          const total = floor.reduce((sum, r) => sum + r.shipments, 0);
          const done = floor.reduce((sum, r) => sum + r.verified, 0);
          return total === 0 ? 100 : (done / total) * 100;
        })();

  return (
    <>
      <PageHeader
        title="Receive & verify"
        description="Everything inbound — in the air, on the floor, and being checked off. Oldest first; cargo on the floor comes before cargo in the air."
        actions={
          next ? (
            <Button asChild variant="signal" className="rounded-lg">
              <Link href={`/app/receive/${next.id}`}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                {t(locale, "Check in")} {next.batchNumber}
              </Link>
            </Button>
          ) : null
        }
      />

      <StatStrip
        className="mb-5"
        chips={[
          {
            label: t(locale, "On the floor"),
            value: String(summary.onFloor),
            icon: Warehouse,
            tone: summary.onFloor > 0 ? "warning" : "success",
          },
          {
            label: t(locale, "To check in"),
            value: String(summary.uncheckedShipments),
            icon: Package,
            tone: summary.uncheckedShipments > 0 ? "warning" : "success",
          },
          {
            label: t(locale, "In the air"),
            value: String(summary.inAir),
            icon: Plane,
            tone: "brand",
          },
          {
            label: t(locale, "Arriving weight"),
            value: formatWeight(summary.inAirWeightKg),
            icon: Plane,
          },
          {
            label: t(locale, "Oldest wait"),
            value: summary.oldestWaitDays > 0 ? `${summary.oldestWaitDays}d` : "—",
            icon: Clock,
            tone: summary.oldestWaitDays >= 2 ? "danger" : "neutral",
          },
          {
            label: t(locale, "Flags"),
            value: String(summary.openExceptions),
            icon: AlertTriangle,
            tone: summary.openExceptions > 0 ? "danger" : "success",
            href: "/app/exceptions",
          },
        ]}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label={t(locale, "Cargo to check in")}
          numeric={summary.uncheckedShipments}
          ringPct={checkedShare}
          ringLabel={t(locale, "Share of floor cargo already checked in")}
          hint={`${t(locale, "across")} ${summary.onFloor} ${t(locale, "batch(es) on the floor")}`}
          icon={ClipboardCheck}
          tone={summary.uncheckedShipments > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={1}
          label={t(locale, "Batches on the floor")}
          numeric={summary.onFloor}
          hint={t(locale, "Landed, not yet closed off")}
          icon={Warehouse}
          tone={summary.onFloor > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={2}
          label={t(locale, "Batches in the air")}
          numeric={summary.inAir}
          hint={`${formatWeight(summary.inAirWeightKg)} ${t(locale, "arriving")}`}
          icon={Plane}
          tone="brand"
        />
        <KpiCard
          delay={3}
          label={t(locale, "Longest on the floor")}
          value={
            summary.oldestWaitDays > 0
              ? `${summary.oldestWaitDays} ${t(locale, "days")}`
              : "—"
          }
          hint={t(locale, "Chase anything past two days")}
          icon={Clock}
          tone={summary.oldestWaitDays >= 2 ? "danger" : "info"}
          invertDelta
        />
      </div>

      {/* Urgent callout — only when something has genuinely been sitting. */}
      {next && (next.waitDays ?? 0) >= 1 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-destructive border-y border-r bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">
                {next.batchNumber} {t(locale, "has been on the floor for")}{" "}
                {next.waitDays} {t(locale, next.waitDays === 1 ? "day" : "days")}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {next.unchecked} {t(locale, "of")} {next.shipments}{" "}
                {t(locale, "consignment(s) still unchecked.")}{" "}
                {t(
                  locale,
                  "Customers cannot be invoiced until their cargo is checked in."
                )}
              </p>
            </div>
          </div>
          <Button asChild variant="destructive" size="sm">
            <Link href={`/app/receive/${next.id}`}>{t(locale, "Open now")}</Link>
          </Button>
        </div>
      ) : null}

      <ReceivingQueue rows={rows} />

      {/*
        FLIGHTS THAT ARE DONE, FOR THE BOX THAT TURNS UP LATE.

        The queue above is the work: what is in the air and what is on the
        floor. This is not work — it is the way back to a flight that was
        finished last week, because a consignment surfaces in a corner of the
        warehouse a fortnight after the aircraft it came on was closed, and it
        belongs to that flight rather than to whichever one happens to be open.

        Opening one gives the same screen, with the same "Add cargo".
      */}
      {older.length > 0 ? (
        <section className="mt-6 rounded-xl border bg-card">
          <header className="border-b p-4">
            <h2 className="text-sm font-semibold">
              {t(locale, "Flights already finished")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "Open one to add a consignment that turned up after it was closed."
              )}
            </p>
          </header>
          <ul className="divide-y">
            {older.map((batch) => (
              <li key={batch.id}>
                <Link
                  href={`/app/receive/${batch.id}`}
                  className="focus-ring flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {batch.batchNumber}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(locale, ORIGIN_LABELS[batch.origin])} ·{" "}
                      {batch._count.shipments}{" "}
                      {t(locale, "consignment(s)")}
                    </span>
                  </span>
                  <BatchStatusBadge status={batch.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
