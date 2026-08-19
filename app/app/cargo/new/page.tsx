import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentForm } from "@/components/app/shipment-form";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { cargoTypesByCategory } from "@/lib/pricing";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";

export const metadata: Metadata = { title: "Receive cargo" };

export default async function NewShipmentPage() {
  const user = await requirePermission("shipment.create");

  const locale = await viewerLocale();

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
        title={t(locale, "Receive cargo")}
        description={t(
          locale,
          "Record what arrived. The system works out the route, the batch and the price."
        )}
      />
      <ShipmentForm
        locale={locale}
        typesByCategory={typesByCategory}
        canAddItem={can(user.role, "cargoType.suggest")}
        photosDurable={storageIsDurable()}
      />
    </div>
  );
}
