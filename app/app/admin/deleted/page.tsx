import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Trash2 } from "lucide-react";

import {
  PurgeCargoForm,
  RestoreCargoButton,
} from "@/components/app/cargo-delete";
import { PageHeader } from "@/components/app/page-header";
import { CATEGORY_LABELS } from "@/lib/cargo";
import { formatDateTime, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
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
  await requirePermission("shipment.cancel");
  const locale = await viewerLocale();

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

  return (
    <>
      <PageHeader
        title="Deleted records"
        description="Nothing is ever destroyed. Every deletion is kept here with its reason, its photos and the person who made it."
      />

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

              <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
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

              <PurgeCargoForm
                shipmentId={cargo.id}
                trackingNumber={cargo.trackingNumber}
                photoCount={cargo.photos.length}
                packageCount={cargo._count.packageList}
              />

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
