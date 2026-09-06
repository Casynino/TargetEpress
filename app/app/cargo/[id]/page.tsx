import { outstandingOf } from "@/lib/invoice-balance";
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
import { CargoDeleteButton, DeleteCargoForm } from "@/components/app/cargo-delete";
import { PendingSubmissionNotice } from "@/components/app/pending-submission-notice";
import { ReleaseUndo } from "@/components/app/release-undo";
import { ShipmentActions } from "@/components/app/shipment-actions";
import { PackageList } from "@/components/app/package-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BILLED_INVOICE_STATUSES,
  DAMAGE_SEVERITY_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
  GOODS_TYPE_LABELS,
  ORIGIN_LABELS,
  RESOLUTION_TYPE_LABELS,
  SHIPMENT_STATUS_META,
  blocksPickup,
  formatPackages,
  storageFreeDaysLeft,
  storageUncharged,
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
import { freightBasisOf } from "@/lib/support";
import { shortfallBill } from "@/lib/collections";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can, canAmendCargo } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { StorageStatusCard } from "@/components/app/storage-status-card";
import { STORAGE_POLICY, storageStatus } from "@/lib/constants";
import { currentRateValue } from "@/lib/fx";
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
              /* Which account the desk says it went into — shown on the notice
                 below in place of the payment method that used to sit there. */
              account: { select: { name: true } },
              /* Where Support expects the fare to be paid from, so the panel
                 can offer it back to Finance already chosen. */
              transportSource: { select: { id: true, name: true } },
              /* Which bills the claim covers. A write-off across several has
                 to name one, and the panel says which — see shortfallBill. */
              _count: { select: { allocations: true } },
              allocations: {
                select: {
                  invoiceId: true,
                  amount: true,
                  invoice: {
                    select: { shipment: { select: { trackingNumber: true } } },
                  },
                },
              },
              proofs: { select: { id: true } },
            },
          },
          payments: {
            orderBy: { paidAt: "desc" },
            include: {
              receipt: true,
              receivedBy: { select: { name: true } },
              account: { select: { name: true } },
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
  /*
    The rest of what this customer owes.

    A clerk settling one consignment often has the customer on the phone saying
    "I am paying for all of them". Until now they had to remember that the
    combined screen existed and go and find it; the join belongs here, where
    the question is actually asked. Counted only for desks that may see money.
  */
  const otherUnpaid = can(user.role, "finance.view")
    ? await prisma.invoice.count({
        where: {
          customerId: shipment.customerId,
          status: { in: [...BILLED_INVOICE_STATUSES] },
          shipmentId: { not: shipment.id },
          shipment: { deletedAt: null },
        },
      })
    : 0;

  const storage = storageStatus(shipment.arrivedAt, shipment.deliveredAt);
  const storageRate = await currentRateValue();
  /* Seeing the status is everybody's business; deciding it is Finance's. */
  const canBill = can(user.role, "finance.view");
  const canWaive = can(user.role, "invoice.discount");

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
  const canVerifyPayments = can(user.role, "payment.verify");
  /**
   * Every desk that can see money sees this, because each has a different thing
   * to do with it: Finance verifies it, Support tells the customer where it has
   * got to, and the CEO can see why cargo that reads unpaid is not being
   * chased. The warehouses never see money and are not shown it.
   */
  const pendingSubmissions = showMoney
    ? (shipment.invoice?.submissions ?? []).map((s) => ({
        id: s.id,
        submissionNumber: s.submissionNumber,
        amount: toNumber(s.amount),
        currency: s.currency,
        accountName: s.account?.name ?? null,
        reference: s.reference,
        submittedAt: s.submittedAt,
        submittedByName: s.submittedBy?.name ?? null,
        proofCount: s.proofs.length,
        /* The delivery half, so the panel can say why the claimed figure is
           larger than the bill instead of leaving it looking like an
           overpayment nobody can account for. */
        transport: toNumber(s.transportAmount),
        transportSourceId: s.transportSourceId,
        transportSourceName: s.transportSource?.name ?? null,
        /* What Support was told about the gap, so the verify panel opens with
           their answer rather than making Finance work it out again. */
        clearShortfall: s.clearShortfall,
        /* Which bill the write-off lands on, when this one transfer answers
           several. Null on the ordinary single-bill claim. */
        clearsOn:
          shortfallBill(s.allocations, s.clearShortfallInvoiceId)?.invoice
            .shipment?.trackingNumber ?? null,
      }))
    : [];
  // Only for the desk that can take money. Nobody else is offered a question
  // about which company account something landed in, and the list is not
  // fetched for them either.
  /* Also for the desk that VERIFIES money, not only the one that takes it —
     agreeing a claim has to say which account it landed in, and that decision
     is now made on this page rather than on another one. */
  /*
    AND FOR THE DESK THAT CLAIMS IT, NOT ONLY THE ONES THAT BANK IT.

    Support raises the claim from this page now, and a claim has to say which
    account the customer's proof names — the owner's rule, and the server
    refuses one without it. Fetching the list for payment.record and
    payment.verify alone left their two account fields empty with no way to
    fill them, so the form could be completed and never accepted.

    Reading the list is not permission to move money: recordPayment and
    submitPaymentForVerification each authorise themselves, and which of them
    this panel posts to is decided by the role.
  */
  const accounts =
    can(user.role, "payment.record") ||
    can(user.role, "payment.submit") ||
    canVerifyPayments
      ? await activeAccounts()
      : [];
  // Rounded to the cent: this figure is both shown to a person and used as the
  // default in a step="0.01" amount input, which refuses a raw float remainder.
  const outstanding = shipment.invoice
    ? roundMoney(
        outstandingOf(shipment.invoice)
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
                button. canAmendCargo is the same predicate editCargo and the
                edit page use; when this was spelled out here by hand it drifted
                from them twice. */}
            {can(user.role, "shipment.edit") &&
            canAmendCargo(user.role, shipment.status) ? (
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={`/app/cargo/${shipment.trackingNumber}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t(locale, "Edit")}
                </Link>
              </Button>
            ) : null}
            {/* As easy to delete as to edit, at the owner's instruction —
                the desk that typed the mistake fixes it without hunting for
                the control at the foot of the edit page. Same server gates:
                the amend window, reason required, nothing destroyed. */}
            {can(user.role, "shipment.delete") &&
            canAmendCargo(user.role, shipment.status) ? (
              <CargoDeleteButton
                shipmentId={shipment.id}
                trackingNumber={shipment.trackingNumber}
                /* backTo already knows a loading table from a flown batch;
                   inventing the route again here is how the two disagree. */
                backHref={backTo?.href ?? "/app/cargo/new"}
                backLabel={
                  backTo
                    ? `${t(locale, "Back to")} ${backTo.label}`
                    : t(locale, "Register another")
                }
              />
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
                        {/* The account it went into. This printed the payment
                            method lowercased — "mobile money" — which is a
                            category, and two of the company's accounts are
                            mobile money. An account name is a proper noun and
                            is not lowercased. */}
                        <span className="font-normal text-muted-foreground">
                          {payment.account?.name ??
                            t(locale, "no account named")}
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

              {/* The way back, at the foot of the record it undoes. Management
                  only: Dar hands cargo over, and the desk that made the
                  mistake is not the desk that should erase it. */}
              {can(user.role, "delivery.undo") ? (
                <ReleaseUndo
                  shipmentId={shipment.id}
                  trackingNumber={shipment.trackingNumber}
                  receiverName={shipment.delivery.receiverName}
                />
              ) : null}
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
            accounts={accounts}
            /* Cash and the Lipa number only — the fare never leaves a bank. */
            transportAccounts={accounts.filter(
              (account) =>
                account.kind === "CASH" || account.kind === "MOBILE_MONEY"
            )}
            /* The bill itself, so the panel can work out what a claim would
               leave owing. Converted at the rate frozen onto the invoice — the
               rate the payment will actually settle at. */
            billCurrency={shipment.invoice?.currency ?? "USD"}
            billOutstanding={
              shipment.invoice ? outstandingOf(shipment.invoice) : 0
            }
            billRate={
              shipment.invoice?.exchangeRate
                ? toNumber(shipment.invoice.exchangeRate)
                : null
            }
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
          {otherUnpaid > 0 ? (
            <Link
              href={`/app/finance/payments/new?customer=${shipment.customerId}`}
              className="focus-ring block rounded-xl border border-brand/40 bg-brand/5 p-4 text-sm hover:bg-brand/10"
            >
              <span className="font-medium">
                {t(locale, "{name} has {n} other unpaid consignment(s)")
                  .replace("{name}", shipment.customer.name)
                  .replace("{n}", String(otherUnpaid))}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(locale, "Paying for several at once? Take it as one payment.")}
              </span>
            </Link>
          ) : null}

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
                      /* The rate the cargo was charged at, composed where the
                         follow-up queue composes it. Without this the message
                         sent from here was missing the one line that makes the
                         total checkable, while the same message sent from the
                         queue had it. */
                      freightBasis: freightBasisOf(shipment),
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
            /* What is already off the bill, and whether this desk may move it.
               Finance, the manager and the owner hold invoice.discount. */
            invoiceDiscount={
              shipment.invoice ? toNumber(shipment.invoice.discount) : 0
            }
            canDiscount={can(user.role, "invoice.discount")}
            canAdjust={can(user.role, "ledger.adjust")}
            invoiceStorage={
              shipment.invoice
                ? toNumber(shipment.invoice.storageWaivedUsd) > 0
                  ? 0
                  : toNumber(shipment.invoice.storageCharge)
                : 0
            }
            invoiceStorageUncharged={
              shipment.invoice
                ? storageUncharged({ ...shipment.invoice, shipment })
                : 0
            }
            invoiceStorageFreeDays={storageFreeDaysLeft(shipment)}
            canWaiveStorage={can(user.role, "invoice.storage.waive")}
            /* Charging the accrued days is invoice.edit, which is what the
               action asks for — not the waiver permission beside it. */
            canChargeStorage={can(user.role, "invoice.edit")}
            invoiceTotal={shipment.invoice ? toNumber(shipment.invoice.total) : 0}
            canChangeRate={can(user.role, "invoice.rate")}
            /* Credit granted means the cargo may go before the money does —
               without this the server can issue a credit note and no button in
               the interface can ask it to. */
            creditApproved={shipment.invoice?.creditStatus === "APPROVED"}
            /* The credit door, on the page where the customer is actually
               asked. customer: true above already loads the term and limit. */
            credit={
              shipment.invoice &&
              shipment.invoice.status !== "DRAFT" &&
              shipment.invoice.status !== "VOID" &&
              shipment.invoice.status !== "WRITTEN_OFF" &&
              outstanding !== null &&
              outstanding > 0 &&
              shipment.invoice.creditStatus === "NONE" &&
              can(user.role, "credit.request")
                ? {
                    invoiceId: shipment.invoice.id,
                    outstanding: `${shipment.currency} ${outstanding.toFixed(2)}`,
                    defaultTerm: shipment.customer.creditTermDays ?? 14,
                    limitLabel:
                      shipment.customer.creditLimitUsd === null
                        ? null
                        : `USD ${toNumber(shipment.customer.creditLimitUsd).toFixed(2)}`,
                    canApprove: can(user.role, "credit.approve"),
                  }
                : undefined
            }
            currency={shipment.currency}
            pickupNoteId={shipment.pickupNote?.id ?? null}
            pickupNoteNumber={shipment.pickupNote?.noteNumber ?? null}
            pickupNoteStatus={shipment.pickupNote?.status ?? null}
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

          {/* The same pair the header button asks. It read shipment.cancel,
              which was management-only and so needed no window; both warehouses
              hold cancelling now, and a delete door with no custody rule would
              let Guangzhou remove a consignment standing on Dar's floor. */}
          {can(user.role, "shipment.delete") &&
          canAmendCargo(user.role, shipment.status) ? (
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
