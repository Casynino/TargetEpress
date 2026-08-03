import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  Boxes,
  CheckCheck,
  ClipboardCheck,
  Clock,
  Warehouse,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import {
  VerificationQueue,
  type VerificationBatchRow,
} from "@/components/app/verification-queue";
import { Button } from "@/components/ui/button";
import { formatDateTime, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Verification" };

const DAY = 86_400_000;

/**
 * The verification bench.
 *
 * A batch lands (ARRIVED) and its manifest is then ticked off line by line
 * until every shipment is accounted for, at which point it is closed off
 * (VERIFIED). This page is the queue of everything in between — the work that
 * is genuinely open right now.
 *
 * It is a queue, not a workbench: the actual ticking-off lives on the batch's
 * own screen, which already holds the package-level checkboxes and the flag
 * form. Duplicating that here would mean two places where cargo can be
 * declared present, and only one of them in front of the cargo.
 */
export default async function VerificationPage() {
  await requirePermission("batch.verify");

  const [bench, closedOff] = await Promise.all([
    prisma.batch.findMany({
      // ARRIVED is precisely "landed, manifest not signed off".
      where: { status: "ARRIVED" },
      // Longest on the bench first — nothing can be invoiced or collected
      // until it is checked off, so age is the whole priority.
      orderBy: [{ arrivedAt: "asc" }, { batchNumber: "asc" }],
      select: {
        id: true,
        batchNumber: true,
        origin: true,
        airline: true,
        flightNumber: true,
        waybillNumber: true,
        arrivedAt: true,
        arrivalDate: true,
        shipments: {
          orderBy: { registeredAt: "asc" },
          select: {
            id: true,
            trackingNumber: true,
            packages: true,
            packageType: true,
            weightKg: true,
            description: true,
            customer: { select: { name: true } },
            packageList: { select: { id: true, receivedAt: true } },
          },
        },
        verifications: {
          select: {
            shipmentId: true,
            result: true,
            note: true,
            verifiedAt: true,
            verifiedBy: { select: { name: true } },
          },
        },
        exceptions: {
          orderBy: { raisedAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            description: true,
            raisedAt: true,
            raisedBy: { select: { name: true } },
            shipment: { select: { trackingNumber: true } },
          },
        },
      },
    }),
    prisma.batch.findMany({
      where: { status: { in: ["VERIFIED", "CLOSED"] }, verifiedAt: { not: null } },
      orderBy: { verifiedAt: "desc" },
      take: 5,
      select: {
        id: true,
        batchNumber: true,
        verifiedAt: true,
        _count: { select: { shipments: true } },
      },
    }),
  ]);

  const now = Date.now();

  const rows: VerificationBatchRow[] = bench.map((batch) => {
    const verificationByShipment = new Map(
      batch.verifications.map((v) => [v.shipmentId, v])
    );

    const lines = batch.shipments.map((shipment) => {
      const verification = verificationByShipment.get(shipment.id) ?? null;
      return {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        customerName: shipment.customer.name,
        packages: shipment.packages,
        packageType: shipment.packageType,
        // Older cargo predates per-box labels, so the tracked count can be 0.
        // Reporting "0 of 0 boxes here" as a shortage would be a lie.
        packagesTracked: shipment.packageList.length,
        packagesPresent: shipment.packageList.filter(
          (pkg) => pkg.receivedAt !== null
        ).length,
        weightKg: toNumber(shipment.weightKg),
        description: shipment.description,
        result: verification?.result ?? null,
        note: verification?.note ?? null,
        checkedBy: verification?.verifiedBy?.name ?? null,
        checkedAt: verification?.verifiedAt.toISOString() ?? null,
      };
    });

    // Who ticked off what, busiest first. Names come from the verification
    // rows, so this is the record of the check — not who happens to be on shift.
    const tally = new Map<string, number>();
    for (const verification of batch.verifications) {
      const name = verification.verifiedBy?.name ?? "Unknown";
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const checkers = [...tally.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const landed = batch.arrivedAt ?? batch.arrivalDate;

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      origin: batch.origin,
      airline: batch.airline,
      flightNumber: batch.flightNumber,
      waybillNumber: batch.waybillNumber,
      arrivedAt: landed?.toISOString() ?? null,
      waitDays: landed
        ? Math.max(0, Math.floor((now - landed.getTime()) / DAY))
        : null,
      shipments: batch.shipments.length,
      checked: batch.verifications.length,
      passed: batch.verifications.filter((v) => v.result === "VERIFIED").length,
      flagged: batch.verifications.filter((v) => v.result === "EXCEPTION").length,
      unchecked: batch.shipments.length - batch.verifications.length,
      packagesTracked: lines.reduce((sum, line) => sum + line.packagesTracked, 0),
      packagesPresent: lines.reduce((sum, line) => sum + line.packagesPresent, 0),
      weightKg: lines.reduce((sum, line) => sum + line.weightKg, 0),
      openFlags: batch.exceptions.filter((e) => e.status === "OPEN").length,
      checkers,
      lines,
      flags: batch.exceptions.map((exception) => ({
        id: exception.id,
        type: exception.type,
        open: exception.status === "OPEN",
        description: exception.description,
        trackingNumber: exception.shipment.trackingNumber,
        raisedBy: exception.raisedBy?.name ?? null,
        raisedAt: exception.raisedAt.toISOString(),
      })),
    };
  });

  const totalLines = rows.reduce((sum, row) => sum + row.shipments, 0);
  const checkedLines = rows.reduce((sum, row) => sum + row.checked, 0);
  const outstanding = totalLines - checkedLines;
  // "Ready" is exactly what completeVerification will accept: no line left
  // unchecked. Every place on this page that says so uses this same test.
  const readyToClose = rows.filter((row) => row.unchecked === 0);
  const openFlags = rows.reduce((sum, row) => sum + row.openFlags, 0);
  const oldestWaitDays = rows.reduce(
    (max, row) => Math.max(max, row.waitDays ?? 0),
    0
  );
  // Boxes counted short only on lines someone has actually been to.
  const boxesShort = rows.reduce(
    (sum, row) =>
      sum +
      row.lines.reduce(
        (inner, line) =>
          line.result === null
            ? inner
            : inner + Math.max(0, line.packagesTracked - line.packagesPresent),
        0
      ),
    0
  );
  const checkedShare = totalLines === 0 ? 100 : (checkedLines / totalLines) * 100;
  const next = rows.find((row) => row.unchecked > 0);

  return (
    <>
      <PageHeader
        title="Verification"
        description="Cargo that has landed but has not been signed off against its manifest."
        actions={
          next ? (
            <Button asChild variant="signal" className="rounded-lg">
              <Link href={`/app/receive/${next.id}`}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Check off {next.batchNumber}
              </Link>
            </Button>
          ) : null
        }
      />

      <StatStrip
        className="mb-5"
        chips={[
          {
            label: "On the bench",
            value: String(rows.length),
            icon: Warehouse,
            tone: rows.length > 0 ? "warning" : "success",
          },
          {
            label: "Lines checked",
            value: `${checkedLines}/${totalLines}`,
            icon: ClipboardCheck,
          },
          {
            label: "Boxes short",
            value: String(boxesShort),
            icon: Boxes,
            tone: boxesShort > 0 ? "danger" : "success",
          },
          {
            label: "Flags",
            value: String(openFlags),
            icon: AlertTriangle,
            tone: openFlags > 0 ? "danger" : "success",
            href: "/app/exceptions",
          },
          {
            label: "Oldest",
            value: oldestWaitDays > 0 ? `${oldestWaitDays}d` : "—",
            icon: Clock,
            tone: oldestWaitDays >= 2 ? "danger" : "neutral",
          },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Lines still to check"
          numeric={outstanding}
          ringPct={checkedShare}
          ringLabel="Share of bench cargo already checked off"
          hint={`across ${rows.length} batch(es) on the bench`}
          icon={ClipboardCheck}
          tone={outstanding > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={1}
          label="Ready to close off"
          numeric={readyToClose.length}
          hint="Every line checked — waiting on sign-off"
          icon={CheckCheck}
          tone={readyToClose.length > 0 ? "signal" : "info"}
        />
        <KpiCard
          delay={2}
          label="Flags raised"
          numeric={openFlags}
          hint="Blocks release until cleared"
          icon={AlertTriangle}
          tone={openFlags > 0 ? "danger" : "success"}
          href="/app/exceptions"
        />
        <KpiCard
          delay={3}
          label="Longest on the bench"
          value={oldestWaitDays > 0 ? `${oldestWaitDays} days` : "—"}
          hint="Chase anything past two days"
          icon={Clock}
          tone={oldestWaitDays >= 2 ? "danger" : "info"}
        />
      </div>

      {/* A fully checked batch is finished work that has not been signed off.
          It is the cheapest thing on this page to clear, so it is surfaced
          above the queue rather than found by scanning it. */}
      {readyToClose.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-success border-y border-r bg-success/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-medium">
                {readyToClose.length} batch
                {readyToClose.length === 1 ? " is" : "es are"} fully checked
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Close off{" "}
                {readyToClose
                  .slice(0, 3)
                  .map((row) => row.batchNumber)
                  .join(", ")}
                {readyToClose.length > 3
                  ? ` and ${readyToClose.length - 3} more`
                  : ""}{" "}
                so the cargo can move on to invoicing.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {readyToClose.slice(0, 3).map((row) => (
              <Button key={row.id} asChild size="sm" variant="brand">
                <Link href={`/app/receive/${row.id}`}>{row.batchNumber}</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {openFlags > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-destructive border-y border-r bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">
                {openFlags} open flag{openFlags === 1 ? "" : "s"} on cargo being
                checked in
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Short and damaged cargo cannot be released until each flag is
                dealt with. Open a batch below to see which lines they belong
                to.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="destructive">
            <Link href="/app/exceptions">Open flags</Link>
          </Button>
        </div>
      ) : null}

      <VerificationQueue rows={rows} />

      {closedOff.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">Recently closed off</h2>
          <ul className="divide-y rounded-xl border bg-card shadow-soft">
            {closedOff.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/app/receive/${batch.id}`}
                    className="font-mono text-sm font-semibold tabular hover:text-brand"
                  >
                    {batch.batchNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular">
                    {batch._count.shipments} shipment(s)
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  signed off {formatDateTime(batch.verifiedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
