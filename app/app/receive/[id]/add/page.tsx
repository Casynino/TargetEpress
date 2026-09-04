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
 * IT HAS ALREADY ARRIVED, BECAUSE IT IS ON THE FLOOR. Recording it as in
 * transit would send it back through an arrival it has made, to wait on a
 * manifest for a flight that has landed. So it is received, and priced from
 * the weight recorded here — which raises a DRAFT and puts it in front of
 * Finance, the manager, the owner and Support to confirm, exactly like every
 * other box the floor takes in. Dar states the weight; it does not set the
 * price.
 *
 * Any flight, at any time. A box turns up a fortnight after its flight was
 * closed and still belongs to that flight, not to whichever one is open.
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

  /* The same refusals the action makes, said before the form is filled in
     rather than after. A flight's own state is not one of them: a box turns up
     weeks after its flight was closed and still belongs to it. */
  const refusal = !can(user.role, "batch.verify")
    ? t(locale, "Adding cargo to a flight is done by the desk that receives cargo at Dar.")
    : batch.permanent
      ? t(
          locale,
          "This is a loading table, not a flight. Cargo joins it by being registered in China."
        )
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${t(locale, "Add cargo to")} ${batch.batchNumber}`}
        description={t(
          locale,
          "For a box on the floor that was never registered. It joins this flight, is recorded as already here, and goes straight to Finance for the price to be confirmed."
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
