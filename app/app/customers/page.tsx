import type { Metadata } from "next";

import { CustomersTable, type CustomerRow } from "@/components/app/customers-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Customers" };

/**
 * The customer book.
 *
 * Search, filtering and sorting all live in the table now, so this page only
 * has to decide what each role may be sent. Money is the line: `outstanding` is
 * left off the payload entirely for anyone without finance.view, rather than
 * being sent and hidden in the markup.
 */
export default async function CustomersPage() {
  const user = await requirePermission("customer.view");
  const locale = await viewerLocale();
  const showMoney = can(user.role, "finance.view");

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      createdAt: true,
      shipments: {
        orderBy: { registeredAt: "desc" },
        select: {
          status: true,
          registeredAt: true,
          invoice: showMoney
            ? { select: { total: true, amountPaid: true } }
            : false,
        },
      },
    },
  });

  const rows: CustomerRow[] = customers.map((customer) => {
    const active = customer.shipments.filter(
      (shipment) =>
        shipment.status !== "DELIVERED" && shipment.status !== "CANCELLED"
    ).length;

    const outstanding = showMoney
      ? customer.shipments.reduce((sum, shipment) => {
          const invoice = shipment.invoice;
          if (!invoice) return sum;
          return (
            sum + Math.max(0, toNumber(invoice.total) - toNumber(invoice.amountPaid))
          );
        }, 0)
      : undefined;

    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
      shipments: customer.shipments.length,
      activeShipments: active,
      outstanding,
      createdAt: customer.createdAt.toISOString(),
      lastShipmentAt: customer.shipments[0]?.registeredAt.toISOString() ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Created automatically the first time cargo is registered against a name or number."
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t(locale, "No customers yet")}
          description={t(
            locale,
            "They appear here as soon as the China desk registers cargo."
          )}
        />
      ) : (
        <CustomersTable rows={rows} />
      )}
    </>
  );
}
