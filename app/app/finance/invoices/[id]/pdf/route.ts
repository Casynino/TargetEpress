import { NextResponse } from "next/server";

import { AIRPORT_LABELS, CATEGORY_LABELS } from "@/lib/cargo";
import { accountsForInvoice } from "@/lib/company-settings";
import { formatDate, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

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
/**
 * What the file is called once it lands on somebody's phone.
 *
 * It was INV-2026-000063.pdf, which is the right name for a filing cabinet and
 * useless in a WhatsApp thread: the person forwarding it is looking at a list of
 * attachments and needs to know which customer and which shipment without
 * opening any of them. So: one name and the tracking number — "Daniel
 * TX-000063.pdf".
 *
 * One name, not the whole thing. Business customers are registered under names
 * like "Neema Traders Ltd", and a filename that long is truncated by every chat
 * client at exactly the point where the tracking number would have been.
 */
function invoiceFileName(customerName: string, trackingNumber: string) {
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  // Anything a filesystem or a Content-Disposition header would choke on: the
  // separators, the quote that would close the header value early, and control
  // characters. Letters and digits from any script survive.
  const clean = first.replace(/[^\p{L}\p{N}]/gu, "");
  const name = clean.length > 0 ? clean : "Customer";
  const full = `${name} ${trackingNumber}.pdf`;

  return {
    full,
    // The fallback has to be plain ASCII. A Swahili or Chinese name reduced to
    // nothing here still leaves the tracking number, which is the half that
    // identifies the cargo.
    ascii:
      full.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "").trim() ||
      `${trackingNumber}.pdf`,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("invoice.manage");
  const locale = await viewerLocale();
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
          ...selectText("description"),
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
    return NextResponse.json(
      { error: t(locale, "Invoice not found.") },
      { status: 404 }
    );
  }

  if (invoice.status === "DRAFT") {
    return NextResponse.json(
      {
        error: t(
          locale,
          "This price has not been confirmed yet. Confirm it before downloading or sending the invoice."
        ),
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
    // The cargo description follows whoever is downloading it, not whoever
    // typed it: Guangzhou registers 手机配件 and Dar gets it in English.
    description: cargoText(locale, invoice.shipment, "description"),
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

  const fileName = invoiceFileName(
    invoice.customer.name,
    invoice.shipment.trackingNumber
  );

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // attachment, not inline: the point is a file on the phone that can be
      // forwarded, not another tab.
      //
      // Both forms of the name. filename* carries the real one; the quoted
      // filename is the ASCII fallback for anything that does not read RFC 5987,
      // and it has to come first or some clients take the fallback and stop.
      "Content-Disposition":
        `attachment; filename="${fileName.ascii}"; ` +
        `filename*=UTF-8''${encodeURIComponent(fileName.full)}`,
      "Cache-Control": "no-store",
    },
  });
}
