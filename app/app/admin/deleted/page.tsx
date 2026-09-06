import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Trash2 } from "lucide-react";

import {
  PurgeCargoForm,
  RestoreCargoButton,
} from "@/components/app/cargo-delete";
import { PageHeader } from "@/components/app/page-header";
import { CATEGORY_LABELS } from "@/lib/cargo";
import { formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Deleted records" };

/**
 * Everything that was deleted, and why.
 *
 * The point of soft delete is this page. A record removed from the working
 * system is still a record: who took it out, when, on what grounds, and what it
 * said at the time. Photos survive deletion too, which is what stops a deletion
 * from being a way to make evidence disappear.
 */
export default async function DeletedRecordsPage() {
  const user = await requirePermission("records.viewDeleted");
  const locale = await viewerLocale();

  /*
    Reading this page and emptying it are two different authorities.

    Getting in is records.viewDeleted — the owner and the manager, since
    restoring a record and reading why it went are exactly the manager's job. Erasing one for
    good is shipment.purge, which is the owner's and nobody else's. The purge
    control was drawn on every row for whoever got through the door, so a manager
    was offered a button purgeCargo would then refuse. It failed loudly rather
    than dangerously, but a control nobody may press should not be drawn at all —
    offering it teaches the reader the wrong thing about who holds what.
  */
  const canPurge = can(user.role, "shipment.purge");

  // Asking for deletedAt explicitly is what opts this query out of the global
  // filter in lib/prisma. Nowhere else in the app does that.
  const deleted = await prisma.shipment.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true, phone: true } },
      deletedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { packageList: true } },
      photos: { select: { id: true, url: true } },
      batch: { select: { batchNumber: true } },
    },
  });

  /*
    Money that was taken back, on the page where somebody comes looking for it.

    This page knew only about deleted cargo, so a cancelled payment and a
    withdrawn claim — the two corrections that actually move a figure — were
    only findable in the audit log, which is not where anybody thinks to look for
    "what did we undo". Both are kept records rather than deletions, so they read
    as what they are: the amount, who cancelled it, and why.
  */
  const [voidedPayments, withdrawnClaims] = await Promise.all([
    prisma.payment.findMany({
      where: { voidedAt: { not: null } },
      orderBy: { voidedAt: "desc" },
      take: 100,
      select: {
        id: true,
        amount: true,
        currency: true,
        voidedAt: true,
        voidReason: true,
        voidedBy: { select: { name: true } },
        receipt: { select: { receiptNumber: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            customer: { select: { name: true } },
            shipment: { select: { trackingNumber: true } },
          },
        },
      },
    }),
    prisma.paymentSubmission.findMany({
      where: { status: "WITHDRAWN" },
      orderBy: { reviewedAt: "desc" },
      take: 100,
      select: {
        id: true,
        submissionNumber: true,
        amount: true,
        currency: true,
        reviewedAt: true,
        rejectionReason: true,
        reviewedBy: { select: { name: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            customer: { select: { name: true } },
            shipment: { select: { trackingNumber: true } },
          },
        },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Deleted records"
        description="Nothing is ever destroyed. Every deletion and every cancelled payment is kept here with its reason and the person who made it."
      />

      {/* The money corrections first: they are the ones with a figure attached,
          and a figure somebody took back is what gets asked about. */}
      {voidedPayments.length > 0 || withdrawnClaims.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">
            {t(locale, "Cancelled money")}
          </h2>
          <ul className="panel divide-y overflow-hidden">
            {voidedPayments.map((v) => (
              <li key={v.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">
                    {v.invoice?.customer.name}
                    <span className="ml-2 text-[11px] font-normal text-warning">
                      {t(locale, "payment cancelled")}
                    </span>
                  </p>
                  <p className="shrink-0 font-display text-sm font-bold tabular line-through opacity-70">
                    {v.currency} {toNumber(v.amount).toFixed(2)}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">
                    {v.receipt?.receiptNumber ? `${v.receipt.receiptNumber} · ` : ""}
                    {v.invoice?.invoiceNumber}
                    {v.invoice?.shipment?.trackingNumber
                      ? ` · ${v.invoice?.shipment.trackingNumber}`
                      : ""}
                  </span>
                  {v.voidedBy?.name ? ` · ${t(locale, "by")} ${v.voidedBy.name}` : ""}
                  {v.voidedAt ? ` · ${formatDateTime(v.voidedAt, locale)}` : ""}
                  {v.voidReason ? ` — “${v.voidReason}”` : ""}
                </p>
              </li>
            ))}
            {withdrawnClaims.map((w) => (
              <li key={w.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">
                    {w.invoice.customer.name}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {t(locale, "claim withdrawn")}
                    </span>
                  </p>
                  <p className="shrink-0 font-display text-sm font-bold tabular line-through opacity-70">
                    {w.currency} {toNumber(w.amount).toFixed(2)}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">
                    {w.submissionNumber} · {w.invoice.invoiceNumber}
                    {w.invoice.shipment?.trackingNumber
                      ? ` · ${w.invoice.shipment.trackingNumber}`
                      : ""}
                  </span>
                  {w.reviewedBy?.name ? ` · ${t(locale, "by")} ${w.reviewedBy.name}` : ""}
                  {w.reviewedAt ? ` · ${formatDateTime(w.reviewedAt, locale)}` : ""}
                  {w.rejectionReason ? ` — “${w.rejectionReason}”` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {deleted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">
            {t(locale, "Nothing has been deleted")}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t(
              locale,
              "Deleted cargo appears here, with everything it had at the moment it was removed."
            )}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {deleted.map((cargo) => (
            <li
              key={cargo.id}
              className="rounded-xl border border-warning/30 bg-card p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-base font-bold">
                    {cargo.trackingNumber}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {cargo.customer.name}
                    {cargo.customer.phone ? ` · ${cargo.customer.phone}` : ""}
                  </p>
                </div>
                <RestoreCargoButton
                  shipmentId={cargo.id}
                  trackingNumber={cargo.trackingNumber}
                />
              </div>

              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  {t(locale, "Reason")}
                </p>
                <p className="mt-1 text-sm">
                  {cargo.deleteReason ?? t(locale, "No reason recorded")}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(locale, "Deleted by")}{" "}
                  {cargo.deletedBy?.name ??
                    t(locale, "someone no longer on the system")}
                  {cargo.deletedAt ? ` · ${formatDateTime(cargo.deletedAt, locale)}` : ""}
                </p>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {[
                  {
                    label: "Cargo",
                    // What the box actually says, in the reader's language.
                    value: cargoText(locale, cargo, "description"),
                  },
                  {
                    label: "Type",
                    value: t(locale, CATEGORY_LABELS[cargo.cargoCategory]),
                  },
                  { label: "Weight", value: formatWeight(cargo.weightKg) },
                  { label: "Packages", value: String(cargo.packages) },
                  { label: "Batch", value: cargo.batch?.batchNumber ?? "—" },
                  { label: "Received by", value: cargo.createdBy?.name ?? "—" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {t(locale, item.label)}
                    </dt>
                    <dd className="mt-0.5 truncate font-medium">{item.value}</dd>
                  </div>
                ))}
              </dl>

              {canPurge ? (
                <PurgeCargoForm
                  shipmentId={cargo.id}
                  trackingNumber={cargo.trackingNumber}
                  photoCount={cargo.photos.length}
                  packageCount={cargo._count.packageList}
                />
              ) : null}

              {cargo.photos.length > 0 ? (
                <div className="mt-4 border-t pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />
                    {cargo.photos.length}{" "}
                    {cargo.photos.length === 1
                      ? t(locale, "photo")
                      : t(locale, "photos")}{" "}
                    {t(locale, "preserved")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cargo.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-14 w-14 overflow-hidden rounded border transition-transform hover:scale-105"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={`${t(locale, "Preserved photo for")} ${cargo.trackingNumber}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        {t(locale, "Every deletion and restore is also written to the")}{" "}
        <Link href="/app/admin/audit" className="text-brand hover:underline">
          {t(locale, "audit log")}
        </Link>
        .
      </p>
    </>
  );
}
