import { NextResponse } from "next/server";

import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { normaliseCode } from "@/lib/format";
import { invoiceDocumentResponse, loadInvoiceDocument } from "@/lib/invoice-document";
import { STILL_COLLECTABLE } from "@/lib/payable";
import { clientAddress, hit } from "@/lib/rate-limit";
import { trackKeyValid } from "@/lib/track-key";

/**
 * THE CUSTOMER'S OWN COPY OF THEIR BILL.
 *
 * Nobody signs in here. The customer tapped the link in the message we sent
 * them and may never have had an account, so the signed key in that link is
 * what stands in for one: it is made from this tracking number and this
 * application's secret, and it cannot be made for the consignment next door
 * (lib/track-key.ts). Without it this address is nothing, which is the point —
 * tracking numbers run in sequence, and the file carries the customer's name,
 * their phone, their city and every charge line.
 *
 * Three more things must be true before the bytes go out, and each of them is
 * already true somewhere else on the public page:
 *
 *   - the consignment is not deleted. Said out loud rather than left to the
 *     Prisma extension, which filters shipments read on their own and not a
 *     shipment reached through its invoice — and deleted cargo appears
 *     nowhere, PDFs included;
 *   - the bill is one somebody really owes: not a draft, and not the VOID a
 *     deleted consignment leaves behind, nor a written-off one;
 *   - the cargo has landed in Dar, or money has already been paid against it.
 *     The tracking page applies the same test before it shows a figure at
 *     all, because a price read off a packing list is not a bill.
 */
export const runtime = "nodejs";

/* Generous for a person — a customer may download their bill twice and hand
   the phone to somebody who downloads it again — and slow enough to make
   walking the numbers pointless. */
const DOWNLOADS = 20;
const WINDOW_MS = 10 * 60 * 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const typed = decodeURIComponent(code);
  // The same normalisation the search box applies, so "tx136", "tx-000136"
  // and "TX-000136" open the same bill.
  const trackingNumber = normaliseCode(typed) || typed.toUpperCase();
  const key = new URL(request.url).searchParams.get("k");

  const address = await clientAddress();
  if (!hit(`track-invoice:${address}`, DOWNLOADS, WINDOW_MS).ok) {
    return NextResponse.json(
      { error: "Too many downloads. Try again in a few minutes." },
      { status: 429 }
    );
  }

  /* 404 rather than 403. A wrong key and a consignment that does not exist
     are the same answer on purpose: neither tells a stranger they have found
     a real tracking number. */
  if (!trackingNumber || !trackKeyValid(trackingNumber, key)) {
    return NextResponse.json(
      { error: "This link cannot open an invoice." },
      { status: 404 }
    );
  }

  const document = await loadInvoiceDocument({
    status: { in: [...BILLED_INVOICE_STATUSES] },
    shipment: { trackingNumber, deletedAt: null },
    OR: [
      { shipment: { status: { in: [...STILL_COLLECTABLE] } } },
      { amountPaid: { gt: 0 } },
    ],
  });

  if (!document) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  return invoiceDocumentResponse(document, {
    // A customer's bill is not a page for a search engine to keep.
    "X-Robots-Tag": "noindex, nofollow",
  });
}
