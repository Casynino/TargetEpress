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
import { formatWeight } from "@/lib/format";
import { receivingQueue } from "@/lib/queries";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Receive & verify" };

export default async function ReceivePage() {
  await requirePermission("batch.receive");

  const { rows, summary } = await receivingQueue();

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
        description="Everything inbound — in the air and on the floor — oldest first. Cargo on the floor comes before cargo in the air."
        actions={
          next ? (
            <Button asChild variant="signal" className="rounded-lg">
              <Link href={`/app/receive/${next.id}`}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Check in {next.batchNumber}
              </Link>
            </Button>
          ) : null
        }
      />

      <StatStrip
        className="mb-5"
        chips={[
          {
            label: "On the floor",
            value: String(summary.onFloor),
            icon: Warehouse,
            tone: summary.onFloor > 0 ? "warning" : "success",
          },
          {
            label: "To check in",
            value: String(summary.uncheckedShipments),
            icon: Package,
            tone: summary.uncheckedShipments > 0 ? "warning" : "success",
          },
          { label: "In the air", value: String(summary.inAir), icon: Plane, tone: "brand" },
          {
            label: "Arriving weight",
            value: formatWeight(summary.inAirWeightKg),
            icon: Plane,
          },
          {
            label: "Oldest wait",
            value: summary.oldestWaitDays > 0 ? `${summary.oldestWaitDays}d` : "—",
            icon: Clock,
            tone: summary.oldestWaitDays >= 2 ? "danger" : "neutral",
          },
          {
            label: "Flags",
            value: String(summary.openExceptions),
            icon: AlertTriangle,
            tone: summary.openExceptions > 0 ? "danger" : "success",
            href: "/app/exceptions",
          },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Shipments to check in"
          numeric={summary.uncheckedShipments}
          ringPct={checkedShare}
          ringLabel="Share of floor cargo already checked in"
          hint={`across ${summary.onFloor} batch(es) on the floor`}
          icon={ClipboardCheck}
          tone={summary.uncheckedShipments > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={1}
          label="Batches on the floor"
          numeric={summary.onFloor}
          hint="Landed, not yet closed off"
          icon={Warehouse}
          tone={summary.onFloor > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={2}
          label="Batches in the air"
          numeric={summary.inAir}
          hint={`${formatWeight(summary.inAirWeightKg)} arriving`}
          icon={Plane}
          tone="brand"
        />
        <KpiCard
          delay={3}
          label="Longest on the floor"
          value={summary.oldestWaitDays > 0 ? `${summary.oldestWaitDays} days` : "—"}
          hint="Chase anything past two days"
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
                {next.batchNumber} has been on the floor for {next.waitDays} day
                {next.waitDays === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {next.unchecked} of {next.shipments} shipment(s) still unchecked.
                Customers cannot be invoiced until their cargo is checked in.
              </p>
            </div>
          </div>
          <Button asChild variant="destructive" size="sm">
            <Link href={`/app/receive/${next.id}`}>Open now</Link>
          </Button>
        </div>
      ) : null}

      <ReceivingQueue rows={rows} />
    </>
  );
}
