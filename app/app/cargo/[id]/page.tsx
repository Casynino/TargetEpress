import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  Boxes,
  Camera,
  Pencil,
  Printer,
  ReceiptText,
  Truck,
  User,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { DeleteCargoForm } from "@/components/app/cargo-delete";
import { ShipmentActions } from "@/components/app/shipment-actions";
import { PackageList } from "@/components/app/package-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DAMAGE_SEVERITY_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
  GOODS_TYPE_LABELS,
  ORIGIN_LABELS,
  RESOLUTION_TYPE_LABELS,
  SHIPMENT_STATUS_META,
  blocksPickup,
  formatPackages,
} from "@/lib/constants";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatWeight,
  roundMoney,
  toNumber,
} from "@/lib/format";
import { composeMessage, whatsappLink } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipment" };

/** URLs use the tracking number, but a cuid must still resolve. */
function whereFor(id: string) {
  return id.startsWith("TX-")
    ? { trackingNumber: id.toUpperCase() }
    : { id };
}

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const { id } = await params;

  const shipment = await prisma.shipment.findUnique({
    where: whereFor(decodeURIComponent(id)),
    include: {
      customer: true,
      batch: true,
      createdBy: { select: { name: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true } } },
      },
      exceptions: {
        orderBy: { raisedAt: "desc" },
        include: {
          raisedBy: { select: { name: true } },
          resolvedBy: { select: { name: true } },
        },
      },
      invoice: {
        include: {
          payments: {
            orderBy: { paidAt: "desc" },
            include: {
              receipt: true,
              receivedBy: { select: { name: true } },
            },
          },
        },
      },
      packageList: {
        orderBy: { sequence: "asc" },
        include: { receivedBy: { select: { name: true } } },
      },
      pickupNote: { include: { issuedBy: { select: { name: true } } } },
      delivery: { include: { releasedBy: { select: { name: true } } } },
    },
  });

  if (!shipment) notFound();

  const openExceptions = shipment.exceptions.filter((exception) =>
    blocksPickup(exception.status)
  );
  const showInternal = can(user.role, "shipment.viewInternal");
  const canPrintLabel = can(user.role, "label.print");
  // Rendered only for the desk that owns the label. Not fetched at all for
  // anyone else — a code never generated cannot be screenshotted off a page
  // that merely hides it with CSS.
  const qr = canPrintLabel
    ? await shipmentQrDataUrl(shipment.qrToken, 200)
    : null;
  const showMoney = can(user.role, "finance.view");
  // Rounded to the cent: this figure is both shown to a person and used as the
  // default in a step="0.01" amount input, which refuses a raw float remainder.
  const outstanding = shipment.invoice
    ? roundMoney(
        toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid)
      )
    : null;

  return (
    <>
      <PageHeader
        title={shipment.trackingNumber}
        description={`${shipment.customer.name} · ${SHIPMENT_STATUS_META[shipment.status].description}`}
        actions={
          <>
            <ShipmentStatusBadge status={shipment.status} />
            {/* The status says where the cargo is; this says what is wrong
                with it. Damaged cargo is still "Received at Dar", so the two
                have to be read together or a broken box looks healthy. */}
            {openExceptions.map((exception) => (
              <Badge key={exception.id} variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {EXCEPTION_TYPE_LABELS[exception.type]}
              </Badge>
            ))}
            {/* Offered only while the record can actually be changed — a
                disabled button that explains itself on click is worse than no
                button. */}
            {can(user.role, "shipment.edit") &&
            (shipment.status === "READY_TO_DEPART" ||
              can(user.role, "shipment.purge")) ? (
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={`/app/cargo/${shipment.trackingNumber}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {/* The sticker is made in Guangzhou and travels on the box.
                Every desk after that reads it; none of them prints another. */}
            {canPrintLabel ? (
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={`/app/cargo/${shipment.trackingNumber}/label`}>
                  <Printer className="mr-2 h-4 w-4" />
                  Label
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Cargo */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-display font-semibold">Cargo</h2>
            <dl className="grid gap-px bg-border sm:grid-cols-3">
              {[
                { label: "Goods type", value: GOODS_TYPE_LABELS[shipment.goodsType] },
                {
                  label: "Counted as",
                  value: formatPackages(shipment.packages, shipment.packageType),
                },
                { label: "Weight", value: formatWeight(shipment.weightKg) },
                { label: "Origin", value: ORIGIN_LABELS[shipment.origin] },
                {
                  label: "Volume",
                  value: shipment.volumeCbm
                    ? `${toNumber(shipment.volumeCbm)} CBM`
                    : "—",
                },
                {
                  label: "Batch",
                  value: shipment.batch?.batchNumber ?? "Not assigned",
                },
                {
                  label: "Carton",
                  value: shipment.cartonRef ?? "—",
                },
              ].map((item) => (
                <div key={item.label} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t p-5">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="mt-1 text-sm">{shipment.description}</p>
              {showInternal && shipment.internalNotes ? (
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs font-medium text-warning">
                    Internal note — never shown to the customer
                  </p>
                  <p className="mt-1 text-sm">{shipment.internalNotes}</p>
                </div>
              ) : null}
            </div>
          </section>

          {/* The physical boxes. Each has its own QR and its own arrival. */}
          {shipment.packageList.length > 0 ? (
            <PackageList
              trackingNumber={shipment.trackingNumber}
              packageType={shipment.packageType}
              canPrint={canPrintLabel}
              packages={shipment.packageList.map((pkg) => ({
                id: pkg.id,
                sequence: pkg.sequence,
                reference: pkg.reference,
                receivedAt: pkg.receivedAt,
                deliveredAt: pkg.deliveredAt,
                receivedByName: pkg.receivedBy?.name ?? null,
              }))}
            />
          ) : null}

          {/* Photos — the visual record from receipt to handover */}
          {shipment.photos.length > 0 ? (
            <section className="panel">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <Camera className="h-4 w-4" />
                  Photos
                </h2>
                <p className="text-xs text-muted-foreground tabular">
                  {shipment.photos.length}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                {shipment.photos.map((photo) => (
                  <li key={photo.id}>
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring group block overflow-hidden rounded-lg border"
                    >
                      {/* Sizes vary and some are remote Blob URLs; a plain img
                          avoids configuring a loader for every future host. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption ?? "Cargo photo"}
                        className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </a>
                    <p className="mt-1.5 text-xs font-medium">
                      {photo.kind === "PROOF_OF_DELIVERY"
                        ? "Handover"
                        : photo.kind === "DAMAGE"
                          ? "Damage"
                          : "Receiving"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(photo.createdAt)}
                      {showInternal && photo.uploadedBy
                        ? ` · ${photo.uploadedBy.name}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="panel border-warning/40 p-5">
              <p className="flex items-start gap-2 text-sm text-warning">
                <Camera className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No photos on record. Every shipment registered from now on
                  requires one; this predates that rule.
                </span>
              </p>
            </section>
          )}

          {/* What is wrong with this cargo.
              Kept above the money and below the boxes: whoever opens a
              shipment because a customer is standing at the counter needs to
              know it is damaged before they read anything else about it. */}
          {shipment.exceptions.length > 0 ? (
            <section
              className={`rounded-xl border bg-card shadow-soft ${
                openExceptions.length > 0 ? "border-destructive/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
                <h2
                  className={`flex items-center gap-2 font-display font-semibold ${
                    openExceptions.length > 0 ? "text-destructive" : ""
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {openExceptions.length > 0
                    ? "This cargo has a problem"
                    : "Problems on record"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {openExceptions.length > 0
                    ? `${openExceptions.length} under investigation · do not hand over`
                    : "All resolved"}
                </p>
              </div>
              <ul className="divide-y">
                {shipment.exceptions.map((exception) => {
                  const open = blocksPickup(exception.status);
                  return (
                    <li key={exception.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={open ? "destructive" : "muted"}>
                          {EXCEPTION_TYPE_LABELS[exception.type]}
                        </Badge>
                        {exception.severity ? (
                          <Badge variant="muted" className="text-[10px]">
                            {DAMAGE_SEVERITY_LABELS[exception.severity]}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {EXCEPTION_STATUS_LABELS[exception.status]} ·{" "}
                          {formatDateTime(exception.raisedAt)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm">{exception.description}</p>

                      {/* The outcome, in the shape the resolution was filed in.
                          Only the fields that outcome actually has — a found
                          box has no weight correction to show. */}
                      {exception.resolutionType ? (
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-medium">
                            {RESOLUTION_TYPE_LABELS[exception.resolutionType]}
                            {exception.resolvedAt
                              ? ` · ${formatDate(exception.resolvedAt)}`
                              : ""}
                          </p>
                          {exception.resolutionNote ? (
                            <p className="mt-1 text-sm">
                              {exception.resolutionNote}
                            </p>
                          ) : null}
                          {exception.foundLocation ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Found: {exception.foundLocation}
                            </p>
                          ) : null}
                          {exception.weightWasKg && exception.weightNowKg ? (
                            <p className="mt-1 text-xs text-muted-foreground tabular">
                              Weight {formatWeight(exception.weightWasKg)} →{" "}
                              {formatWeight(exception.weightNowKg)}
                            </p>
                          ) : null}
                          {exception.damageOutcome ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Settled: {exception.damageOutcome}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Names are internal. The warehouse needs to know the
                          cargo is damaged, not which colleague reported it. */}
                      {showInternal ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Raised by {exception.raisedBy?.name ?? "—"}
                          {exception.resolvedBy
                            ? ` · Closed by ${exception.resolvedBy.name}`
                            : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Money */}
          {showMoney ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
                <ReceiptText className="h-4 w-4" />
                Invoice &amp; payments
              </h2>

              {!shipment.invoice ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No invoice has been raised for this shipment yet.
                </p>
              ) : (
                <>
                  <dl className="grid gap-px bg-border sm:grid-cols-4">
                    {[
                      { label: "Invoice", value: shipment.invoice.invoiceNumber },
                      {
                        label: "Total",
                        value: formatMoney(
                          shipment.invoice.total,
                          shipment.invoice.currency
                        ),
                      },
                      {
                        label: "Paid",
                        value: formatMoney(
                          shipment.invoice.amountPaid,
                          shipment.invoice.currency
                        ),
                      },
                      {
                        label: "Outstanding",
                        value: formatMoney(
                          outstanding ?? 0,
                          shipment.invoice.currency
                        ),
                      },
                    ].map((item) => (
                      <div key={item.label} className="bg-card p-4">
                        <dt className="text-xs text-muted-foreground">
                          {item.label}
                        </dt>
                        <dd className="mt-1 font-mono text-sm font-medium tabular">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {shipment.invoice.payments.length > 0 ? (
                    <ul className="divide-y border-t">
                      {shipment.invoice.payments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium tabular">
                              {formatMoney(payment.amount, payment.currency)}{" "}
                              <span className="font-normal text-muted-foreground">
                                {payment.method.replace("_", " ").toLowerCase()}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {payment.receipt?.receiptNumber} ·{" "}
                              {payment.receivedBy?.name ?? "—"} ·{" "}
                              {formatDateTime(payment.paidAt)}
                            </p>
                          </div>
                          {payment.reference ? (
                            <span className="code-chip">{payment.reference}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {/* Delivery */}
          {shipment.delivery ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
                <Truck className="h-4 w-4" />
                Delivery record
              </h2>
              <dl className="grid gap-px bg-border sm:grid-cols-3">
                {[
                  { label: "Received by", value: shipment.delivery.receiverName },
                  { label: "Phone", value: shipment.delivery.receiverPhone },
                  {
                    label: "Relationship",
                    value: shipment.delivery.relationship.toLowerCase(),
                  },
                  {
                    label: "ID number",
                    value: shipment.delivery.receiverIdNumber ?? "—",
                  },
                  {
                    label: "Released by",
                    value: shipment.delivery.releasedBy?.name ?? "—",
                  },
                  {
                    label: "Released at",
                    value: formatDateTime(shipment.delivery.releasedAt),
                  },
                ].map((item) => (
                  <div key={item.label} className="bg-card p-4">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1 text-sm font-medium capitalize">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* Timeline */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              Status history
            </h2>
            <ol className="divide-y">
              {shipment.statusHistory.map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShipmentStatusBadge status={entry.toStatus} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                      {entry.location ? ` · ${entry.location}` : ""}
                    </span>
                  </div>
                  {entry.note ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {entry.note}
                    </p>
                  ) : null}
                  {showInternal ? (
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      by {entry.actor?.name ?? "System"}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions first. This column is what somebody does with the cargo;
              who the customer is and which flight it came on are reference,
              and reference does not go above the work. */}
          <ShipmentActions
            shipmentId={shipment.id}
            status={shipment.status}
            role={user.role}
            hasInvoice={Boolean(shipment.invoice)}
            invoiceId={shipment.invoice?.id ?? null}
            invoiceNumber={shipment.invoice?.invoiceNumber ?? null}
            invoiceStatus={shipment.invoice?.status ?? null}
            customerWhatsapp={
              // Only for a confirmed bill — the panel hides Share on a draft,
              // and a link that says "you owe X" must never carry a figure
              // nobody has signed off.
              shipment.invoice && shipment.invoice.status !== "DRAFT"
                ? whatsappLink(
                    shipment.customer.phone,
                    composeMessage("INVOICE_ISSUED", {
                      customerName: shipment.customer.name,
                      trackingNumber: shipment.trackingNumber,
                      description: shipment.description,
                      invoiceNumber: shipment.invoice.invoiceNumber,
                      amountUsd: toNumber(shipment.invoice.total),
                      amountLocal:
                        shipment.invoice.totalLocal === null
                          ? null
                          : toNumber(shipment.invoice.totalLocal),
                      localCurrency: shipment.invoice.localCurrency,
                    })
                  )
                : null
            }
            invoiceRate={
              shipment.invoice?.exchangeRate
                ? toNumber(shipment.invoice.exchangeRate)
                : null
            }
            outstanding={outstanding}
            currency={shipment.currency}
            pickupNoteId={shipment.pickupNote?.id ?? null}
            pickupNoteNumber={shipment.pickupNote?.noteNumber ?? null}
            pickupNoteStatus={shipment.pickupNote?.status ?? null}
            defaultFreight={
              toNumber(shipment.unitRate) * toNumber(shipment.weightKg)
            }
          />
          {/* The code that is printed on the sticker, shown at a size a phone
              can read. That makes it a second copy of the label, so it belongs
              to the desk that owns the label and to nobody else.
              There is no fallback card for other desks: the tracking number is
              already the heading of this page, and repeating it in the sidebar
              spent the most valuable column on a number the reader is looking
              at. That column is for things to do. */}
          {canPrintLabel && qr ? (
            <section className="rounded-xl border bg-card p-5 text-center shadow-soft">
              <Image
                src={qr}
                alt={`QR code for ${shipment.trackingNumber}`}
                width={200}
                height={200}
                className="mx-auto rounded-lg border bg-white p-2"
                unoptimized
              />
              <p className="mt-3 font-mono text-sm font-semibold tabular">
                {shipment.trackingNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The same code from China to release.
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
              <User className="h-4 w-4 text-muted-foreground" />
              Customer
            </h2>
            <div className="space-y-2 p-5 text-sm">
              <p className="font-medium">{shipment.customer.name}</p>
              <p className="text-muted-foreground">
                {shipment.customer.phone ?? "No phone recorded"}
              </p>
              {shipment.customer.city ? (
                <p className="text-muted-foreground">{shipment.customer.city}</p>
              ) : null}
              <p className="pt-2">
                <span className="code-chip">{shipment.customer.code}</span>
              </p>
            </div>
          </section>

          {shipment.batch ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                Batch
              </h2>
              <div className="space-y-2 p-5 text-sm">
                <Link
                  href={`/app/batches/${shipment.batch.id}`}
                  className="font-mono font-medium tabular hover:text-brand"
                >
                  {shipment.batch.batchNumber}
                </Link>
                {shipment.batch.airline ? (
                  <p className="text-muted-foreground">
                    {shipment.batch.airline} {shipment.batch.flightNumber}
                  </p>
                ) : null}
                {shipment.batch.waybillNumber ? (
                  <p className="text-xs text-muted-foreground">
                    Waybill {shipment.batch.waybillNumber}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}


          {showInternal ? (
            <p className="px-1 text-xs text-muted-foreground">
              Registered by {shipment.createdBy?.name ?? "—"} on{" "}
              {formatDateTime(shipment.registeredAt)}.
            </p>
          ) : null}

          {can(user.role, "shipment.cancel") ? (
            <DeleteCargoForm
              shipmentId={shipment.id}
              trackingNumber={shipment.trackingNumber}
              photoCount={shipment.photos.length}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
