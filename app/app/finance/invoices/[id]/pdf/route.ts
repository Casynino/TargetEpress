import { NextResponse } from "next/server";

import { AIRPORT_LABELS, CATEGORY_LABELS } from "@/lib/cargo";
import { accountsForInvoice } from "@/lib/company-settings";
import { formatDate, toNumber } from "@/lib/format";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

/**
 * The invoice as a downloadable file.
 *
 * A route handler rather than a button that calls `window.print()`: the owner
 * needs something they can send, and a print dialog produces nothing to attach
 * to a WhatsApp message.
 *
 * A DRAFT is refused. It is the system's working figure, nobody in Finance has
 * signed it off, and the whole point of a downloadable invoice is that it can
 * leave the building — so this is the one place the draft rule has to be a
 * hard stop rather than a label.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("invoice.manage");
  const { id } = await params;
  const key = decodeURIComponent(id);

  const invoice = await prisma.invoice.findFirst({
    // The page URL uses the invoice number; a cuid must still resolve.
    where: key.startsWith("INV-")
      ? { invoiceNumber: key.toUpperCase() }
      : { id: key },
    select: {
      invoiceNumber: true,
      status: true,
      issuedAt: true,
      dueDate: true,
      currency: true,
      freightCost: true,
      freightOverride: true,
      storageCharge: true,
      storageDays: true,
      otherCharges: true,
      discount: true,
      total: true,
      amountPaid: true,
      exchangeRate: true,
      localCurrency: true,
      totalLocal: true,
      // What this invoice was issued with. Reading today's settings instead
      // would reprint account numbers the customer was never given.
      paymentSnapshot: true,
      customer: { select: { name: true, phone: true, city: true } },
      shipment: {
        select: {
          trackingNumber: true,
          description: true,
          weightKg: true,
          packages: true,
          packageType: true,
          origin: true,
          cargoCategory: true,
          cargoType: { select: { name: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (invoice.status === "DRAFT") {
    return NextResponse.json(
      {
        error:
          "This price has not been confirmed yet. Confirm it before downloading or sending the invoice.",
      },
      { status: 409 }
    );
  }

  const total = toNumber(invoice.total);
  const paid = toNumber(invoice.amountPaid);

  const pdf = renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issuedOn: formatDate(invoice.issuedAt),
    dueOn: invoice.dueDate ? formatDate(invoice.dueDate) : null,
    status: invoice.status,

    customerName: invoice.customer.name,
    customerPhone: invoice.customer.phone,
    customerCity: invoice.customer.city,

    trackingNumber: invoice.shipment.trackingNumber,
    batchNumber: invoice.shipment.batch?.batchNumber ?? null,
    description: invoice.shipment.description,
    weightKg: toNumber(invoice.shipment.weightKg),
    packages: invoice.shipment.packages,
    packageType: invoice.shipment.packageType,
    routeLabel: `${AIRPORT_LABELS[invoice.shipment.origin]} \u2192 Dar es Salaam`,
    cargoLabel:
      invoice.shipment.cargoType?.name ??
      CATEGORY_LABELS[invoice.shipment.cargoCategory],

    currency: invoice.currency,
    // The figure that was actually billed, which is the override when Finance
    // set one — the same coalesce the total was computed from.
    freight:
      invoice.freightOverride === null
        ? toNumber(invoice.freightCost)
        : toNumber(invoice.freightOverride),
    storage: toNumber(invoice.storageCharge),
    storageDays: invoice.storageDays,
    otherCharges: toNumber(invoice.otherCharges),
    discount: toNumber(invoice.discount),
    total,
    paid,
    outstanding: Math.max(0, total - paid),

    exchangeRate:
      invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate),
    localCurrency: invoice.localCurrency,
    totalLocal:
      invoice.totalLocal === null ? null : toNumber(invoice.totalLocal),

    accounts: accountsForInvoice(invoice.paymentSnapshot),
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // attachment, not inline: the point is a file on the phone that can be
      // forwarded, not another tab.
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
