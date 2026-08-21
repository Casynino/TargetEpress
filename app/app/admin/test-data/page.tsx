import Link from "next/link";
import type { Metadata } from "next";
import {
  Banknote,
  Boxes,
  ClipboardCheck,
  FlaskConical,
  PackagePlus,
  Plane,
  ScanLine,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { CopyField } from "@/components/site/copy-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BATCH_STATUS_META } from "@/lib/constants";
import { formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { shipmentQrPayload } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Test data") };
}

/**
 * A guided walkthrough of the live data, for trying the system out.
 *
 * This page exposes each shipment's QR payload, which is normally a credential
 * — so it is gated behind user.manage (the CEO and the manager). It exists because a QR
 * code cannot be scanned off the same screen the camera is attached to, and
 * without a way in, none of the QR workflows can be tested at a desk.
 */
export default async function TestDataPage() {
  await requirePermission("user.manage");
  const locale = await viewerLocale();

  const [shipments, customers, batches, notes] = await Promise.all([
    prisma.shipment.findMany({
      orderBy: { trackingNumber: "asc" },
      select: {
        id: true,
        trackingNumber: true,
        qrToken: true,
        status: true,
        ...selectText("description"),
        packages: true,
        weightKg: true,
        customer: { select: { name: true, phone: true } },
        batch: { select: { batchNumber: true } },
        invoice: { select: { status: true, total: true, amountPaid: true } },
        pickupNote: { select: { noteNumber: true, status: true } },
      },
    }),
    prisma.customer.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        phone: true,
        city: true,
        _count: { select: { shipments: true } },
      },
    }),
    prisma.batch.findMany({
      orderBy: { batchNumber: "asc" },
      select: {
        id: true,
        batchNumber: true,
        status: true,
        airline: true,
        flightNumber: true,
        _count: { select: { shipments: true, verifications: true } },
      },
    }),
    prisma.pickupNote.findMany({
      where: { status: "ACTIVE" },
      select: { noteNumber: true, shipment: { select: { trackingNumber: true } } },
    }),
  ]);

  // Pick concrete records for the scenarios so the instructions name real
  // cargo rather than telling the reader to "find a shipment that…".
  const readyToDepart = shipments.find((s) => s.status === "READY_TO_DEPART");
  const inTransit = shipments.find((s) => s.status === "IN_TRANSIT");
  const unpaidAtDar = shipments.find(
    (s) => s.status === "RECEIVED_AT_DAR" && s.invoice?.status !== "PAID"
  );
  const readyForPickup = shipments.find((s) => s.status === "READY_FOR_PICKUP");
  const delivered = shipments.find((s) => s.status === "DELIVERED");
  const arrivedBatch = batches.find((b) => b.status === "ARRIVED");
  const openBatch = batches.find((b) => b.status === "OPEN");

  const scenarios = [
    {
      icon: ScanLine,
      role: t(locale, "Any role"),
      title: t(locale, "Scan a cargo label"),
      steps: [
        t(
          locale,
          "Press “Scan this” on any cargo in the table below — it opens the scanner with that QR already resolved."
        ),
        t(
          locale,
          "The verdict changes with your role: Finance sees the money, the Dar warehouse sees whether it may release the cargo."
        ),
        `${t(locale, "Try")} ${delivered?.trackingNumber ?? t(locale, "a delivered consignment")} — ${t(locale, "it warns you the cargo has already been collected.")}`,
      ],
    },
    {
      icon: Banknote,
      role: t(locale, "Finance"),
      title: t(locale, "Take payment and clear cargo for collection"),
      steps: unpaidAtDar
        ? [
            `${t(locale, "Open")} ${unpaidAtDar.trackingNumber} — ${t(locale, "it is in the Dar warehouse with an unpaid invoice.")}`,
            t(
              locale,
              "In the Actions panel, press “Record payment”. The outstanding amount is pre-filled; a receipt number is issued instantly."
            ),
            t(
              locale,
              "“Issue pickup note” unlocks once it is settled. That is the only thing that moves cargo to Ready for pickup."
            ),
          ]
        : [
            t(
              locale,
              "All cargo is settled — record a new one to try this flow."
            ),
          ],
    },
    {
      icon: Truck,
      role: t(locale, "Dar Warehouse"),
      title: t(locale, "Release cargo at the counter"),
      steps:
        notes.length > 0
          ? [
              `${t(locale, "Go to Release cargo —")} ${notes[0].shipment.trackingNumber} ${t(locale, "is cleared and waiting.")}`,
              t(
                locale,
                "Pick it, then paste its QR from the table below into the scanner's manual field."
              ),
              t(
                locale,
                "Now try pasting a different consignment's QR: it refuses and tells you not to release it. That is the whole point of the QR system."
              ),
            ]
          : [
              t(
                locale,
                "No cargo is cleared for collection yet — run the Finance scenario above first, then come back."
              ),
            ],
    },
    {
      icon: ClipboardCheck,
      role: t(locale, "Dar Warehouse"),
      title: t(locale, "Check a batch in against the manifest"),
      steps: arrivedBatch
        ? [
            `${t(locale, "Open Receive & verify →")} ${arrivedBatch.batchNumber} (${arrivedBatch._count.shipments - arrivedBatch._count.verifications} ${t(locale, "consignment(s) still unchecked")}).`,
            t(
              locale,
              "Print the manifest to see the tick-column sheet the warehouse actually uses."
            ),
            t(
              locale,
              "Mark one “Present & correct”, and flag another as damaged — the exception appears on the CEO dashboard immediately."
            ),
          ]
        : [t(locale, "No batch is awaiting check-in right now.")],
    },
    {
      icon: PackagePlus,
      role: t(locale, "China Warehouse"),
      title: t(locale, "Receive new cargo"),
      steps: [
        t(
          locale,
          "Go to Receive cargo and type 0762111222 in the phone field — it recognises Kariakoo Traders and fills the name for you."
        ),
        t(
          locale,
          "Fill weight and description, then save. A tracking number and QR label are generated automatically."
        ),
        t(locale, "Print the label — that is the sticker that goes on the carton."),
      ],
    },
    {
      icon: Plane,
      role: t(locale, "China Warehouse"),
      title: t(locale, "Seal a batch and fly it"),
      steps: openBatch
        ? [
            `${t(locale, "Open")} ${openBatch.batchNumber} — ${t(locale, "it has")} ${openBatch._count.shipments} ${t(locale, "consignment(s) loaded.")}`,
            t(locale, "Add any unassigned cargo, then press Seal batch."),
            t(
              locale,
              "Record the departure with an airline and waybill. All cargo inside flips to In transit, and the public tracking page updates."
            ),
          ]
        : [t(locale, "No open batch — create one from Batches → Open batch.")],
    },
    {
      icon: Boxes,
      role: t(locale, "Customer (no login)"),
      title: t(locale, "Track like a customer"),
      steps: [
        `${t(locale, "Open the public site and search")} ${inTransit?.trackingNumber ?? readyToDepart?.trackingNumber ?? "TX-000005"} ${t(locale, "on the tracking page.")}`,
        t(
          locale,
          "Note what is missing: no staff names, no prices, no internal notes."
        ),
        `${t(locale, "Now search a batch number like")} ${arrivedBatch?.batchNumber ?? "BATCH-2026-002"} — ${t(locale, "it shows cargo status only, never the other customers' cargo.")}`,
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Test data & walkthrough"
        description="Everything currently in the database, with one-click ways to try each workflow."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/track" target="_blank">
              {t(locale, "Open public tracking")}
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium text-warning">
            {t(locale, "This page shows QR credentials — CEO/Admin only")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              locale,
              "A QR code is what authorises a release, so it is normally never displayed as text. This screen exists so you can test the scanning workflows at a desk. Remove it before handing the system to staff, or leave it — no other role can reach it."
            )}
          </p>
        </div>
      </div>

      {/* Scenarios */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-lg font-semibold">
          {t(locale, "Try these, in this order")}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scenarios.map(({ icon: Icon, role, title, steps }) => (
            <div key={title} className="panel p-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-signal">
                    {role}
                  </p>
                  <h3 className="font-display font-semibold leading-tight">
                    {title}
                  </h3>
                </div>
              </div>
              <ol className="mt-4 space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* Shipments with scannable codes */}
      <section className="mb-8">
        <h2 className="mb-1 font-display text-lg font-semibold">
          {t(locale, "Cargo")} ({shipments.length})
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t(
            locale,
            "“Scan this” opens the scanner with the code already resolved. “Copy” puts the raw QR payload on your clipboard so you can paste it into the release screen's manual field."
          )}
        </p>

        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Tracking")}</TableHead>
                <TableHead>{t(locale, "Customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Cargo")}
                </TableHead>
                <TableHead>{t(locale, "Status")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Money")}
                </TableHead>
                <TableHead className="text-right">QR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => {
                const payload = shipmentQrPayload(s.qrToken);
                const outstanding = s.invoice
                  ? toNumber(s.invoice.total) - toNumber(s.invoice.amountPaid)
                  : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${s.trackingNumber}`}
                        className="font-mono text-sm font-medium tabular hover:text-brand"
                      >
                        {s.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{s.customer.name}</p>
                      <p className="text-xs text-muted-foreground tabular">
                        {s.customer.phone ?? t(locale, "No phone")}
                      </p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="max-w-[200px] truncate text-sm">
                        {cargoText(locale, s, "description")}
                      </p>
                      <p className="text-xs text-muted-foreground tabular">
                        {s.packages} {t(locale, "pkg")} · {formatWeight(s.weightKg)}
                        {s.batch ? ` · ${s.batch.batchNumber}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={s.status} />
                      {s.pickupNote?.status === "ACTIVE" ? (
                        <p className="mt-1 text-xs text-success">
                          {t(locale, "note")} {s.pickupNote.noteNumber}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {outstanding === null ? (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, "Not invoiced")}
                        </span>
                      ) : outstanding <= 0 ? (
                        <Badge variant="success">{t(locale, "Paid")}</Badge>
                      ) : (
                        <Badge variant="warning">
                          {Math.round(outstanding).toLocaleString()}{" "}
                          {t(locale, "owed")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button asChild size="sm" variant="signal">
                          <Link href={`/app/release?code=${encodeURIComponent(payload)}`}>
                            <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                            {t(locale, "Scan this")}
                          </Link>
                        </Button>
                        <CopyField
                          value={payload}
                          label={t(locale, "Copy")}
                          copiedLabel={t(locale, "Copied")}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Customers */}
        <section>
          <h2 className="mb-1 font-display text-lg font-semibold">
            {t(locale, "Customers")} ({customers.length})
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t(
              locale,
              "Type one of these phone numbers into the cargo form to see auto-fill recognise them."
            )}
          </p>
          <div className="panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Code")}</TableHead>
                  <TableHead>{t(locale, "Name")}</TableHead>
                  <TableHead>{t(locale, "Phone")}</TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Cargo")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono text-xs tabular">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-sm">{c.name}</TableCell>
                    <TableCell>
                      {c.phone ? (
                        <CopyField
                          value={c.phone}
                          label={c.phone}
                          copiedLabel={t(locale, "Copied")}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, "No phone recorded")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {c._count.shipments}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Batches */}
        <section>
          <h2 className="mb-1 font-display text-lg font-semibold">
            {t(locale, "Batches")} ({batches.length})
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t(
              locale,
              "One batch at each stage, so every batch workflow has something to act on."
            )}
          </p>
          <div className="panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Batch")}</TableHead>
                  <TableHead>{t(locale, "Status")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t(locale, "Flight")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Checked")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`/app/batches/${b.id}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {b.batchNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t(locale, BATCH_STATUS_META[b.status].label)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {b.airline ? `${b.airline} ${b.flightNumber ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {b._count.verifications} / {b._count.shipments}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <div className="panel mt-8 p-5">
        <h2 className="font-display font-semibold">{t(locale, "Start over")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            locale,
            "Once you have delivered everything and want a clean set of demo cargo again, run this in the project folder. It wipes the database and reseeds it, including the staff accounts."
          )}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs">
          npm run db:reset
        </pre>
      </div>
    </>
  );
}
