import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  Camera,
  Paperclip,
  Pencil,
  Printer,
  ReceiptText,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { CargoDocuments } from "@/components/app/cargo-documents";
import { DeleteCargoForm } from "@/components/app/cargo-delete";
import { PendingSubmissionNotice } from "@/components/app/pending-submission-notice";
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
import { activeAccounts } from "@/lib/accounts";
import { t } from "@/lib/i18n";
import { composeMessage, whatsappLink } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { StorageStatusCard } from "@/components/app/storage-status-card";
import { STORAGE_POLICY, storageStatus } from "@/lib/constants";
import { currentRateValue } from "@/lib/fx";
import { storageIsDurable } from "@/lib/storage";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Cargo") };
}

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
  const locale = await viewerLocale();
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
      // The consignment's own paperwork — the supplier invoice, the packing
      // list, the customs entry. Newest first: the customs entry that arrived
      // yesterday is what somebody is looking for, not the invoice from March.
      documents: {
        orderBy: { createdAt: "desc" },
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
          /* Who forgave a storage fee, so the card can say so by name. */
          storageWaivedBy: { select: { name: true } },
          // What Customer Support has handed up and Finance has not agreed to
          // yet. Fetched here because this page offers a Record payment form
          // with the full balance pre-filled, and money already in the
          // verification queue is exactly the money somebody would pay twice.
          submissions: {
            where: { status: "PENDING" },
            orderBy: { submittedAt: "desc" },
            include: {
              submittedBy: { select: { name: true } },
              proofs: { select: { id: true } },
            },
          },
          payments: {
            orderBy: { paidAt: "desc" },
            include: {
              receipt: true,
              receivedBy: { select: { name: true } },
              proofs: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  url: true,
                  filename: true,
                  contentType: true,
                },
              },
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

  /*
    The storage clock, derived — never stored, never typed.

    Two dates decide everything: when it landed in Dar and whether it has been
    collected. STORAGE_POLICY holds the 7 free days and the USD 2, so the card,
    the invoice, the tracking page and the reminder all quote one rule.
  */
  const storage = storageStatus(shipment.arrivedAt, shipment.deliveredAt);
  const storageRate = await currentRateValue();
  /* Seeing the status is everybody's business; deciding it is Finance's. */
  const canBill = can(user.role, "finance.view");
  const canWaive = can(user.role, "invoice.discount");

  const openExceptions = shipment.exceptions.filter((exception) =>
    blocksPickup(exception.status)
  );
  const showInternal = can(user.role, "shipment.viewInternal");
  /* Filing the consignment's paperwork. Every department holds this and none of
     it touches the cargo record — see shipment.attach in lib/rbac.ts for why it
     is deliberately not shipment.edit. */
  const canAttach = can(user.role, "shipment.attach");
  const canPrintLabel = can(user.role, "label.print");
  // Rendered only for the desk that owns the label. Not fetched at all for
  // anyone else — a code never generated cannot be screenshotted off a page
  // that merely hides it with CSS.
  const qr = canPrintLabel
    ? await shipmentQrDataUrl(shipment.qrToken, 200)
    : null;
  const showMoney = can(user.role, "finance.view");
  const canVerifyPayments = can(user.role, "payment.verify");
  /**
   * Every desk that can see money sees this, because each has a different thing
   * to do with it: Finance verifies it, Support tells the customer where it has
   * got to, and the CEO can see why cargo that reads unpaid is not being
   * chased. The warehouses never see money and are not shown it.
   */
  const pendingSubmissions = showMoney
    ? (shipment.invoice?.submissions ?? []).map((s) => ({
        submissionNumber: s.submissionNumber,
        amount: toNumber(s.amount),
        currency: s.currency,
        method: s.method,
        reference: s.reference,
        submittedAt: s.submittedAt,
        submittedByName: s.submittedBy?.name ?? null,
        proofCount: s.proofs.length,
      }))
    : [];
  // Only for the desk that can take money. Nobody else is offered a question
  // about which company account something landed in, and the list is not
  // fetched for them either.
  const accounts = can(user.role, "payment.record") ? await activeAccounts() : [];
  // Rounded to the cent: this figure is both shown to a person and used as the
  // default in a step="0.01" amount input, which refuses a raw float remainder.
  const outstanding = shipment.invoice
    ? roundMoney(
        toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid)
      )
    : null;

  /*
    Back to the flight this box was actually on.

    A consignment is almost always opened from its batch — from the manifest,
    from the arrivals list, from a QR scan on the floor — and until now the only
    way back up was the shell's generic control, which reads the URL and can
    therefore only offer "Arrived batches". Naming the batch turns one guess
    into the record above this one.

    Loading tables live under /app/batches and departed flights under
    /app/shipments; sending a loading table to the wrong one only earns a
    redirect, but the label under it would be the wrong section.

    Cargo registered before it is put on a flight has no batch at all, and then
    the parent genuinely is the list — which is exactly what the shell already
    says, so that case stays off the phone rather than saying it twice.
  */
  const backTo = shipment.batch
    ? {
        href: shipment.batch.permanent
          ? `/app/batches/${shipment.batch.id}`
          : `/app/shipments/${shipment.batch.id}`,
        label: shipment.batch.batchNumber,
      }
    : { href: "/app/shipments", label: "Arrived batches", mobile: false };

  return (
    <>
      <PageHeader
        title={shipment.trackingNumber}
        description={`${shipment.customer.name} · ${t(locale, SHIPMENT_STATUS_META[shipment.status].description)}`}
        backTo={backTo}
        actions={
          <>
            <ShipmentStatusBadge status={shipment.status} />
            {/* The status says where the cargo is; this says what is wrong
                with it. Damaged cargo is still "Received at Dar", so the two
                have to be read together or a broken box looks healthy. */}
            {openExceptions.map((exception) => (
              <Badge key={exception.id} variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {t(locale, EXCEPTION_TYPE_LABELS[exception.type])}
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
                  {t(locale, "Edit")}
                </Link>
              </Button>
            ) : null}
            {/* The sticker is made in Guangzhou and travels on the box.
                Every desk after that reads it; none of them prints another. */}
            {canPrintLabel ? (
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={`/app/cargo/${shipment.trackingNumber}/label`}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t(locale, "Label")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Cargo */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              {t(locale, "Cargo")}
            </h2>
            <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
              {[
                {
                  label: t(locale, "Goods type"),
                  value: t(locale, GOODS_TYPE_LABELS[shipment.goodsType]),
                },
                {
                  label: t(locale, "Counted as"),
                  value: formatPackages(shipment.packages, shipment.packageType, locale),
                },
                { label: t(locale, "Weight"), value: formatWeight(shipment.weightKg) },
                {
                  label: t(locale, "Origin"),
                  value: t(locale, ORIGIN_LABELS[shipment.origin]),
                },
                {
                  label: t(locale, "Volume"),
                  value: shipment.volumeCbm
                    ? `${toNumber(shipment.volumeCbm)} CBM`
                    : "—",
                },
                {
                  label: t(locale, "Batch"),
                  value: shipment.batch ? (
                    <Link
                      href={`/app/batches/${shipment.batch.id}`}
                      className="font-mono tabular hover:text-brand hover:underline"
                    >
                      {shipment.batch.batchNumber}
                    </Link>
                  ) : (
                    t(locale, "Not assigned")
                  ),
                },
                {
                  label: t(locale, "Carton"),
                  value: shipment.cartonRef ?? "—",
                },
                // Who it belongs to and what it flew on, in the same card as
                // the cargo itself. They were three separate panels down the
                // right-hand column, which made reading one consignment a
                // matter of looking in three places.
                {
                  label: t(locale, "Customer"),
                  value: (
                    <Link
                      href={`/app/customers/${shipment.customerId}`}
                      className="hover:text-brand hover:underline"
                    >
                      {shipment.customer.name}
                    </Link>
                  ),
                },
                {
                  label: t(locale, "Phone"),
                  value: shipment.customer.phone ?? t(locale, "Not recorded"),
                },
                {
                  label: t(locale, "Customer code"),
                  value: (
                    <span className="code-chip">{shipment.customer.code}</span>
                  ),
                },
                {
                  label: t(locale, "Flight"),
                  value:
                    [shipment.batch?.airline, shipment.batch?.flightNumber]
                      .filter(Boolean)
                      .join(" ") || t(locale, "Not recorded"),
                },
                {
                  label: t(locale, "Waybill"),
                  value: shipment.batch?.waybillNumber ?? "—",
                },
              ].map((item) => (
                <div key={item.label} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t p-5">
              <p className="text-xs text-muted-foreground">
                {t(locale, "Description")}
              </p>
              <p className="mt-1 text-sm">
                {cargoText(locale, shipment, "description")}
              </p>
              {/* Plain text, no warning box. What is actually in here is
                  packing-list bookkeeping — a carton reference and a row
                  number — and dressing it as a secret the customer must never
                  see made routine detail look like a problem. Nothing on this
                  page is customer-facing; the tracking site is a separate
                  allow-list, so the label was telling staff something they
                  could not act on anyway. */}
              {showInternal && shipment.internalNotes ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {cargoText(locale, shipment, "internalNotes")}
                </p>
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
                  {t(locale, "Photos")}
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
                        alt={photo.caption ?? t(locale, "Cargo photo")}
                        className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </a>
                    <p className="mt-1.5 text-xs font-medium">
                      {photo.kind === "PROOF_OF_DELIVERY"
                        ? t(locale, "Handover")
                        : photo.kind === "DAMAGE"
                          ? t(locale, "Damage")
                          : t(locale, "Receiving")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(photo.createdAt, locale)}
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
                  {t(
                    locale,
                    /* True again. Photos stopped being compulsory — a clerk
                       with a flat battery still has to be able to record the
                       cargo — so this no longer claims a rule that is not
                       enforced. It states the gap and why it matters. */
                    "No photos on record. A photo is what settles a damage claim months later, so add one if the cargo is still to hand."
                  )}
                </span>
              </p>
            </section>
          )}

          {/* The paperwork behind the consignment.
              Beside the photos, because the two are the same thing to whoever
              is arguing about this cargo six weeks later: one is what it looked
              like, the other is what it was declared as. Shown to every desk
              that can open the record — the whole point is that the customs
              entry stops being in one person's WhatsApp. */}
          <CargoDocuments
            shipmentId={shipment.id}
            documents={shipment.documents.map((doc) => ({
              id: doc.id,
              kind: doc.kind,
              label: doc.label,
              url: doc.url,
              filename: doc.filename,
              contentType: doc.contentType,
              bytes: doc.bytes,
              createdAt: doc.createdAt,
              uploadedByName: doc.uploadedBy?.name ?? null,
              // Resolved here rather than in the browser: whether the reader
              // attached a file decides whether they are offered Remove, and
              // that is not a question a client component should answer.
              mine: doc.uploadedById === user.id,
            }))}
            canAttach={canAttach}
            canRemoveAny={can(user.role, "shipment.purge")}
            showNames={showInternal}
            durable={storageIsDurable()}
          />

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
                    ? t(locale, "This cargo has a problem")
                    : t(locale, "Problems on record")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {openExceptions.length > 0
                    ? `${openExceptions.length} ${t(locale, "under investigation · do not hand over")}`
                    : t(locale, "All resolved")}
                </p>
              </div>
              <ul className="divide-y">
                {shipment.exceptions.map((exception) => {
                  const open = blocksPickup(exception.status);
                  return (
                    <li key={exception.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={open ? "destructive" : "muted"}>
                          {t(locale, EXCEPTION_TYPE_LABELS[exception.type])}
                        </Badge>
                        {exception.severity ? (
                          <Badge variant="muted" className="text-xs">
                            {t(locale, DAMAGE_SEVERITY_LABELS[exception.severity])}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {t(locale, EXCEPTION_STATUS_LABELS[exception.status])} ·{" "}
                          {formatDateTime(exception.raisedAt, locale)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm">{exception.description}</p>

                      {/* The outcome, in the shape the resolution was filed in.
                          Only the fields that outcome actually has — a found
                          box has no weight correction to show. */}
                      {exception.resolutionType ? (
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-medium">
                            {t(
                              locale,
                              RESOLUTION_TYPE_LABELS[exception.resolutionType]
                            )}
                            {exception.resolvedAt
                              ? ` · ${formatDate(exception.resolvedAt, locale)}`
                              : ""}
                          </p>
                          {exception.resolutionNote ? (
                            <p className="mt-1 text-sm">
                              {exception.resolutionNote}
                            </p>
                          ) : null}
                          {exception.foundLocation ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(locale, "Found:")} {exception.foundLocation}
                            </p>
                          ) : null}
                          {exception.weightWasKg && exception.weightNowKg ? (
                            <p className="mt-1 text-xs text-muted-foreground tabular">
                              {t(locale, "Weight")}{" "}
                              {formatWeight(exception.weightWasKg)} →{" "}
                              {formatWeight(exception.weightNowKg)}
                            </p>
                          ) : null}
                          {exception.damageOutcome ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(locale, "Settled:")} {exception.damageOutcome}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Names are internal. The warehouse needs to know the
                          cargo is damaged, not which colleague reported it. */}
                      {showInternal ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t(locale, "Raised by")}{" "}
                          {exception.raisedBy?.name ?? "—"}
                          {exception.resolvedBy
                            ? ` · ${t(locale, "Closed by")} ${exception.resolvedBy.name}`
                            : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Money that has actually come in.
              The invoice number, total and outstanding balance are all on the
              Actions panel beside this, on the button that takes the next
              payment — so a card repeating them was four figures the reader had
              already seen. What is NOT anywhere else is the receipt trail, so
              that is all this is, and it only appears once there is one. */}
          {showMoney && (shipment.invoice?.payments.length ?? 0) > 0 ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
                <ReceiptText className="h-4 w-4" />
                {t(locale, "Payments received")}
              </h2>
              <ul className="divide-y">
                {shipment.invoice!.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium tabular">
                        {formatMoney(payment.amount, payment.currency)}{" "}
                        <span className="font-normal text-muted-foreground">
                          {t(
                            locale,
                            payment.method.replace("_", " ").toLowerCase()
                          )}
                        </span>
                        {/* What it was worth against the bill, when the
                            customer paid in a different currency. */}
                        {payment.creditedAmount !== null &&
                        payment.currency !== shipment.invoice!.currency ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            —{" "}
                            {formatMoney(
                              payment.creditedAmount,
                              shipment.invoice!.currency
                            )}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.receipt?.receiptNumber} ·{" "}
                        {payment.receivedBy?.name ?? "—"} ·{" "}
                        {formatDateTime(payment.paidAt, locale)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* The evidence itself, one link per file. A receipt
                          trail nobody can open is a list of claims. */}
                      {payment.proofs.map((proof, index) => (
                        <a
                          key={proof.id}
                          href={proof.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
                        >
                          <Paperclip className="h-3 w-3" />
                          {proof.contentType === "application/pdf"
                            ? t(locale, "Slip")
                            : t(locale, "Screenshot")}
                          {payment.proofs.length > 1 ? ` ${index + 1}` : ""}
                        </a>
                      ))}
                      {payment.reference ? (
                        <span className="code-chip">{payment.reference}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Delivery */}
          {shipment.delivery ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
                <Truck className="h-4 w-4" />
                {t(locale, "Delivery record")}
              </h2>
              <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
                {[
                  {
                    label: t(locale, "Received by"),
                    value: shipment.delivery.receiverName,
                  },
                  {
                    label: t(locale, "Phone"),
                    value: shipment.delivery.receiverPhone,
                  },
                  {
                    label: t(locale, "Relationship"),
                    value: t(
                      locale,
                      shipment.delivery.relationship.toLowerCase()
                    ),
                  },
                  {
                    label: t(locale, "ID number"),
                    value: shipment.delivery.receiverIdNumber ?? "—",
                  },
                  {
                    label: t(locale, "Released by"),
                    value: shipment.delivery.releasedBy?.name ?? "—",
                  },
                  {
                    label: t(locale, "Released at"),
                    value: formatDateTime(shipment.delivery.releasedAt, locale),
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
              {t(locale, "Status history")}
            </h2>
            <ol className="divide-y">
              {shipment.statusHistory.map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShipmentStatusBadge status={entry.toStatus} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt, locale)}
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
                      {t(locale, "by")} {entry.actor?.name ?? t(locale, "System")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Above the actions, not below them. The action directly beneath
              this is a Record payment form with the outstanding balance already
              filled in — so the fact that somebody has already paid has to be
              read before the form is, or it never gets read at all. */}
          <PendingSubmissionNotice
            submissions={pendingSubmissions}
            canVerify={canVerifyPayments}
          />

              {/*
                Beside the money, because that is where the question is asked.

                It was a full-width band across the top of the page — the loudest
                position on the screen given to a figure that is usually zero, with
                the cargo itself pushed below the fold. Somebody about to take a
                payment needs to know whether storage is part of it, so it sits
                here, small, next to the payment panel.
              */}
          {storage.arrivedAt ? (
            <StorageStatusCard
              className="mb-4"
              status={storage}
              locale={locale}
              rate={storageRate}
              decision={
                shipment.invoice && canBill
                  ? {
                      invoiceId: shipment.invoice.id,
                      chargedUsd: toNumber(shipment.invoice.storageCharge),
                      waivedUsd: toNumber(shipment.invoice.storageWaivedUsd),
                      waivedBy: shipment.invoice.storageWaivedBy?.name ?? null,
                      waivedAt: shipment.invoice.storageWaivedAt,
                      waiveReason: shipment.invoice.storageWaiveReason,
                      canDecide: canWaive,
                    }
                  : undefined
              }
            />
          ) : null}

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
                      // The message is Swahili and goes to a Tanzanian trader,
                      // so the cargo line follows the CUSTOMER rather than
                      // whoever is at the screen. This sent the stored text,
                      // which meant a Guangzhou clerk sharing a bill from this
                      // page put 手机配件 in front of somebody in Dar.
                      description: cargoText("en", shipment, "description"),
                      invoiceNumber: shipment.invoice.invoiceNumber,
                      amountUsd: toNumber(shipment.invoice.total),
                      amountLocal:
                        shipment.invoice.totalLocal === null
                          ? null
                          : toNumber(shipment.invoice.totalLocal),
                      localCurrency: shipment.invoice.localCurrency,
                      weightKg: toNumber(shipment.weightKg),
                      exchangeRate:
                        shipment.invoice.exchangeRate === null
                          ? null
                          : toNumber(shipment.invoice.exchangeRate),
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
            /* Credit granted means the cargo may go before the money does —
               without this the server can issue a credit note and no button in
               the interface can ask it to. */
            creditApproved={shipment.invoice?.creditStatus === "APPROVED"}
            currency={shipment.currency}
            pickupNoteId={shipment.pickupNote?.id ?? null}
            pickupNoteNumber={shipment.pickupNote?.noteNumber ?? null}
            pickupNoteStatus={shipment.pickupNote?.status ?? null}
            defaultFreight={
              toNumber(shipment.unitRate) * toNumber(shipment.weightKg)
            }
            accounts={accounts}
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
                alt={`${t(locale, "QR code for")} ${shipment.trackingNumber}`}
                width={200}
                height={200}
                className="mx-auto rounded-lg border bg-white p-2"
                unoptimized
              />
              <p className="mt-3 font-mono text-sm font-semibold tabular">
                {shipment.trackingNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(locale, "The same code from China to release.")}
              </p>
            </section>
          ) : null}

          {showInternal ? (
            <p className="px-1 text-xs text-muted-foreground">
              {t(locale, "Registered by")} {shipment.createdBy?.name ?? "—"}{" "}
              {t(locale, "on")} {formatDateTime(shipment.registeredAt, locale)}.
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
