import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentForm } from "@/components/app/shipment-form";
import { viewerLocale } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { cargoTypesByCategory } from "@/lib/pricing";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";

export const metadata: Metadata = { title: "Receive cargo" };

export default async function NewShipmentPage() {
  await requirePermission("shipment.create");

  // Both airports' open batches are loaded; the form shows only those matching
  // the route the chosen category flies from.
  const [openBatches, typesByCategory] = await Promise.all([
    prisma.batch.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select: { id: true, batchNumber: true, origin: true },
    }),
    cargoTypesByCategory(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Receive cargo"
        description="Record what arrived. The system works out the route, the batch and the price."
      />
      <ShipmentForm
        locale={await viewerLocale()}
        typesByCategory={typesByCategory}
        photosDurable={storageIsDurable()}
      />
    </div>
  );
}
