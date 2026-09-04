import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentForm } from "@/components/app/shipment-form";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { cargoTypesByCategory } from "@/lib/pricing";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Add cargo to the flight" };

/**
 * A BOX THAT ARRIVED WITHOUT A RECORD.
 *
 * On most flights something comes off that is not on the manifest — never
 * registered in Guangzhou, or registered against a different flight. The floor
 * could see it, hold it, weigh it and photograph it, and could not record it,
 * so it either sat in a corner unrecorded or somebody invented it on a screen
 * belonging to another desk.
 *
 * The same form Guangzhou uses, because it is the same job: a customer, what
 * the cargo is, how many pieces and what it weighs. What differs is only which
 * flight it joins, and that is not a choice here — it is the flight whose
 * check-in this page was opened from.
 *
 * THIS DOES NOT CHECK THE CARGO IN. The record is created against the flight
 * and left unticked, so the same manifest check-in that prices every other box
 * prices this one, off the weight the floor confirms. Adding is not receiving,
 * and the price is not Dar's to set.
 */
export default async function AddCargoToBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  /* Creating the record is shipment.create; putting it on a landed flight is
     the job of the desk that checks flights in. createShipment asks for both
     again — it is reachable without this page. */
  const user = await requirePermission("shipment.create");
  const locale = await viewerLocale();
  const { id } = await params;

  const [batch, typesByCategory] = await Promise.all([
    prisma.batch.findUnique({
      where: { id },
      select: {
        id: true,
        batchNumber: true,
        status: true,
        permanent: true,
        airline: true,
        flightNumber: true,
      },
    }),
    cargoTypesByCategory(),
  ]);

  if (!batch) notFound();

  /* The same three refusals the action makes, said before the form is filled
     in rather than after. A loading table is not a flight, and a flight still
     in the air has nothing on the floor to add. */
  const refusal = !can(user.role, "batch.verify")
    ? t(locale, "Adding cargo to a flight is done by the desk that checks flights in.")
    : batch.permanent
      ? t(
          locale,
          "This is a loading table, not a flight. Cargo joins it by being registered in China."
        )
      : batch.status !== "ARRIVED" && batch.status !== "VERIFIED"
        ? t(
            locale,
            "This flight has not landed yet, so there is nothing on the floor to add to it."
          )
        : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${t(locale, "Add cargo to")} ${batch.batchNumber}`}
        description={t(
          locale,
          "For a box that came off this flight and was not on the manifest. It joins the flight and is checked in with the rest."
        )}
        backTo={{
          href: `/app/receive/${batch.id}`,
          label: t(locale, "Back to the check-in"),
        }}
      />
      {refusal ? (
        <p className="panel p-5 text-sm text-muted-foreground">{refusal}</p>
      ) : (
        <ShipmentForm
          locale={locale}
          typesByCategory={typesByCategory}
          canAddItem={can(user.role, "cargoType.suggest")}
          photosDurable={storageIsDurable()}
          batchId={batch.id}
          batchNumber={batch.batchNumber}
        />
      )}
    </div>
  );
}
