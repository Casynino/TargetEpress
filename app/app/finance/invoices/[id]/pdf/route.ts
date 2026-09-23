import { NextResponse } from "next/server";

import { t } from "@/lib/i18n";
import { invoiceDocumentResponse, loadInvoiceDocument } from "@/lib/invoice-document";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

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
 *
 * The document itself is built in lib/invoice-document, because the customer
 * downloads the same one from their tracking link and the two must not be two
 * different bills.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("invoice.manage");
  const locale = await viewerLocale();
  const { id } = await params;
  const key = decodeURIComponent(id);

  const document = await loadInvoiceDocument(
    // The page URL uses the invoice number; a cuid must still resolve.
    key.startsWith("INV-") ? { invoiceNumber: key.toUpperCase() } : { id: key }
  );

  if (!document) {
    return NextResponse.json(
      { error: t(locale, "Invoice not found.") },
      { status: 404 }
    );
  }

  if (document.status === "DRAFT") {
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

  return invoiceDocumentResponse(document);
}
