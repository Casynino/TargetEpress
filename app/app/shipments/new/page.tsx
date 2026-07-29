import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentForm } from "@/components/app/shipment-form";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getDefaultRatePerKg } from "@/lib/settings";

export const metadata: Metadata = { title: "Register shipment" };

export default async function NewShipmentPage() {
  await requirePermission("shipment.create");

  const [openBatches, defaultRate] = await Promise.all([
    prisma.batch.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select: { id: true, batchNumber: true, origin: true },
    }),
    getDefaultRatePerKg(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Register new cargo"
        description="Capture what arrived at the China warehouse. A tracking number and QR label are created automatically."
      />
      <ShipmentForm openBatches={openBatches} defaultRate={defaultRate} />
    </div>
  );
}
