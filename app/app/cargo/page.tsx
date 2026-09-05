import type { Metadata } from "next";
import type { Prisma, ShipmentStatus } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentsTable, type ShipmentRow } from "@/components/app/cargo-table";
import { SHIPMENT_STATUS_META } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Cargo" };

/**
 * The table filters, sorts and paginates on the client over a generous window
 * of rows. That keeps interaction instant, and the window is capped so a
 * 100,000-shipment future does not try to serialise itself into the page — at
 * that point the deep-filter link (?status=) narrows the query server-side.
 */
const WINDOW = 600;

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const locale = await viewerLocale();
  const { status } = await searchParams;

  const statusFilter =
    status && status in SHIPMENT_STATUS_META ? (status as ShipmentStatus) : undefined;

  const where: Prisma.ShipmentWhereInput = statusFilter ? { status: statusFilter } : {};

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { registeredAt: "desc" },
      take: WINDOW,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        ...selectText("description"),
        goodsType: true,
        origin: true,
        packages: true,
        weightKg: true,
        registeredAt: true,
        currency: true,
        customer: { select: { name: true, phone: true } },
        batch: { select: { batchNumber: true } },
        invoice: { select: { total: true, amountPaid: true, amountAdjusted: true, currency: true } },
      },
    }),
    prisma.shipment.count({ where }),
  ]);

  // Warehouse roles must never receive a price. This is enforced by omitting
  // the figure from the payload, not by hiding a column — a hidden column is
  // still in the HTML, and "view source" is not a permission system.
  const showMoney = can(user.role, "finance.view");

  const rows: ShipmentRow[] = shipments.map((s) => ({
    id: s.id,
    trackingNumber: s.trackingNumber,
    status: s.status,
    customerName: s.customer.name,
    customerPhone: s.customer.phone,
    // Resolved here, in the server parent: the table is a client component and
    // cannot ask who is reading it. Guangzhou's Chinese becomes English for a
    // Dar clerk, and stays Chinese for Guangzhou.
    description: cargoText(locale, s, "description"),
    goodsType: s.goodsType,
    origin: s.origin,
    packages: s.packages,
    weightKg: toNumber(s.weightKg),
    batchNumber: s.batch?.batchNumber ?? null,
    registeredAt: s.registeredAt.toISOString(),
    outstanding: showMoney
      ? s.invoice
        ? outstandingOf(s.invoice)
        : null
      : undefined,
    currency: s.invoice?.currency ?? s.currency,
  }));

  return (
    <>
      <PageHeader
        title={t(locale, "Cargo")}
        description={
          statusFilter
            ? `${total.toLocaleString()} ${t(locale, SHIPMENT_STATUS_META[statusFilter].label).toLowerCase()}`
            : `${t(locale, "Every individual customer's cargo.")} ${total.toLocaleString()} ${t(locale, "on record — search here when you need to find one thing.")}`
        }
      />

      {total > WINDOW ? (
        <p className="mb-3 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
          {t(locale, "Showing the")} {WINDOW.toLocaleString()}{" "}
          {t(locale, "most recent of")} {total.toLocaleString()}.{" "}
          {t(locale, "Use a status filter to narrow the set.")}
        </p>
      ) : null}

      <ShipmentsTable
        rows={rows}
        canCreate={can(user.role, "shipment.create")}
        showMoney={showMoney}
        canPrintLabel={can(user.role, "label.print")}
      />
    </>
  );
}
