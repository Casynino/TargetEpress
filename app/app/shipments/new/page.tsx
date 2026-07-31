import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentForm } from "@/components/app/shipment-form";
import { prisma } from "@/lib/prisma";
import { cargoTypesByCategory } from "@/lib/pricing";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";

export const metadata: Metadata = { title: "Register cargo" };

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
        title="Register cargo"
        description="Record what arrived. The system works out the route, the batch and the price."
      />
      <ShipmentForm
        typesByCategory={typesByCategory}
        photosDurable={storageIsDurable()}
      />
    </div>
  );
}
