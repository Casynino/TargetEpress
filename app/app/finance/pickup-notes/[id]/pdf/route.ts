import { NextResponse } from "next/server";

import { cardFileName, pdfHeaders, renderPickupSlipPdf } from "@/lib/card-pdf";
import { COMPANY, formatPackages } from "@/lib/constants";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

/**
 * The pickup slip as a file.
 *
 * The reason this exists at all: Finance issues a note for a customer who is
 * not in the building, and a print dialog produces nothing to send them. This
 * goes onto WhatsApp, the customer arrives with it on their phone, and the
 * counter scans the same code off the screen it would have scanned off paper.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requirePermission("pickupNote.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const note = await prisma.pickupNote.findUnique({
    where: { id },
    select: {
      noteNumber: true,
      status: true,
      issuedAt: true,
      amountPaid: true,
      currency: true,
      customer: { select: { name: true, phone: true } },
      shipment: {
        select: {
          trackingNumber: true,
          qrToken: true,
          ...selectText("description"),
          packages: true,
          packageType: true,
          weightKg: true,
          invoice: { select: { invoiceNumber: true } },
        },
      },
    },
  });

  if (!note) {
    return NextResponse.json(
      { error: t(locale, "Pickup note not found.") },
      { status: 404 }
    );
  }

  const pdf = renderPickupSlipPdf({
    noteNumber: note.noteNumber,
    status: note.status,
    issuedOn: formatDate(note.issuedAt, locale),
    trackingNumber: note.shipment.trackingNumber,
    customerName: note.customer.name,
    customerPhone: note.customer.phone,
    // The reader's rendering, not whatever the Guangzhou desk typed. The card
    // draws through WinAnsi, so an English clerk downloading this now gets the
    // English line rather than Chinese that the font drops on the floor.
    description: cargoText(locale, note.shipment, "description"),
    weightLabel: formatWeight(note.shipment.weightKg),
    packagesLabel: formatPackages(
      note.shipment.packages,
      note.shipment.packageType
    ),
    invoiceNumber: note.shipment.invoice?.invoiceNumber ?? null,
    // Left in English on purpose: the card is drawn by jsPDF's WinAnsi
    // Helvetica, which drops CJK rather than substituting it, so a translated
    // stamp would print as an empty band. The whole card is English for that
    // reason — see winAnsi() in lib/card-pdf.
    paymentStatus: "Paid in full",
    // The figure only for the desks allowed one — the warehouse reads the
    // payment fact and never the amount, the same gate the screen applies.
    amountLabel: can(user.role, "finance.view")
      ? formatMoney(note.amountPaid, note.currency)
      : null,
    officeLines: [...COMPANY.offices[0].lines],
    // 620px into 43mm is ~366dpi; a phone locks onto it off a screen or paper.
    qr: await shipmentQrDataUrl(note.shipment.qrToken, 620),
  });

  const fileName = cardFileName(
    note.customer.name,
    note.shipment.trackingNumber,
    "pickup note"
  );

  return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(fileName) });
}
