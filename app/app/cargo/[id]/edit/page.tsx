import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CargoEditForm } from "@/components/app/cargo-edit-form";
import { DeleteCargoForm } from "@/components/app/cargo-delete";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cargoHistory } from "@/lib/actions/cargo-edit";
import { othersLast } from "@/lib/cargo-types";
import { formatDateTime, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can, canAmendCargo } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Edit cargo") };
}

/**
 * Fixing a record.
 *
 * Edit and delete live on the same page on purpose: they are the same
 * intention ten seconds apart. Someone who opens this because the weight is
 * wrong fixes the weight; someone who opens it because the whole record is a
 * duplicate scrolls past the form to the red box at the bottom.
 *
 * The change history sits beside the form for anyone allowed to see it, so a
 * correction is made with the previous corrections in view.
 */
export default async function EditCargoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("shipment.edit");
  const locale = await viewerLocale();
  const { id } = await params;
  const key = decodeURIComponent(id);

  const cargo = await prisma.shipment.findUnique({
    where: key.startsWith("TX-")
      ? { trackingNumber: key.toUpperCase() }
      : { id: key },
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      description: true,
      weightKg: true,
      packages: true,
      packageType: true,
      internalNotes: true,
      cargoTypeId: true,
      cargoCategory: true,
      customer: { select: { name: true, phone: true } },
      _count: { select: { photos: true } },
    },
  });
  if (!cargo) notFound();

  // Once cargo has flown, its numbers are on a manifest and an invoice. The
  // page is not offered rather than offered and refused.
  //
  // The same call editCargo makes in lib/actions/cargo-edit.ts. If the door and
  // the action ever disagree the reader gets a form that refuses to save, which
  // is why the rule is one function and not a copy in each.
  if (!canAmendCargo(user.role, cargo.status)) {
    redirect(`/app/cargo/${cargo.trackingNumber}`);
  }

  const [pickable, history] = await Promise.all([
    prisma.cargoType.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true },
    }),
    can(user.role, "audit.view") ? cargoHistory(cargo.id) : Promise.resolve([]),
  ]);
  const items = othersLast(pickable);

  return (
    <>
      <PageHeader
        title={`${t(locale, "Edit")} ${cargo.trackingNumber}`}
        description={t(
          locale,
          "Correct what was recorded. Every change is kept on the record."
        )}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/cargo/${cargo.trackingNumber}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t(locale, "Back to cargo")}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <CargoEditForm
            cargo={{
              id: cargo.id,
              trackingNumber: cargo.trackingNumber,
              customerName: cargo.customer.name,
              customerPhone: cargo.customer.phone,
              cargoTypeId: cargo.cargoTypeId,
              description: cargo.description,
              weightKg: toNumber(cargo.weightKg),
              packages: cargo.packages,
              packageType: cargo.packageType,
              internalNotes: cargo.internalNotes,
            }}
            items={items}
            photosDurable={storageIsDurable()}
          />

          {can(user.role, "shipment.delete") ? (
            <DeleteCargoForm
              shipmentId={cargo.id}
              trackingNumber={cargo.trackingNumber}
              photoCount={cargo._count.photos}
            />
          ) : null}
        </div>

        <section className="panel h-fit">
          <div className="border-b px-5 py-4">
            <h2 className="font-display font-semibold">
              {t(locale, "Change history")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {can(user.role, "audit.view")
                ? t(locale, "Every edit ever made to this record.")
                : t(locale, "Kept for management.")}
            </p>
          </div>

          {!can(user.role, "audit.view") ? (
            <p className="p-5 text-sm text-muted-foreground">
              {t(
                locale,
                "Your changes are recorded with your name against them. Management can read the full history."
              )}
            </p>
          ) : history.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {t(locale, "Nothing has been changed since this cargo was received.")}
            </p>
          ) : (
            <ol className="divide-y">
              {history.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    {entry.actorName} · {formatDateTime(entry.createdAt, locale)}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">{t(locale, entry.label)}</span>{" "}
                    <span className="text-muted-foreground line-through">
                      {entry.before}
                    </span>{" "}
                    <span aria-hidden>→</span>{" "}
                    <span className="font-medium">{entry.after}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
