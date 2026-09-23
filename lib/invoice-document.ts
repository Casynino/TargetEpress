import "server-only";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { rateFactsOf } from "@/lib/agreed-rate";
import { AIRPORT_LABELS, CATEGORY_LABELS } from "@/lib/cargo";
import { accountsForInvoice } from "@/lib/company-settings";
import { formatDate, toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { latinLabel } from "@/lib/manifest-pdf";
import { prisma } from "@/lib/prisma";
import { cargoText, selectText } from "@/lib/viewer";

/**
 * ONE INVOICE DOCUMENT, WHICHEVER DOOR IT LEAVES BY.
 *
 * Finance downloads the bill from the invoice page; the customer downloads it
 * from the tracking link in their WhatsApp message. Both are the same piece of
 * paper and they have to be the same piece of paper — a customer's copy that
 * reached its freight figure, its outstanding balance or its payment accounts
 * by a second route would be a different bill from the one in the office, and
 * the first anybody would learn of it is an argument at the counter.
 *
 * So the query, the arithmetic and the filename live here, and each door
 * brings only its own question: who may ask, and which bills it may ask for.
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

/**
 * Read one bill and work out everything the document prints.
 *
 * The `where` is the caller's business: the invoice page names an invoice, the
 * public link names a consignment and the statuses a stranger may be handed.
 * Status is returned rather than filtered here, so a door that wants to say
 * something specific about a draft still can.
 */
export async function loadInvoiceDocument(where: Prisma.InvoiceWhereInput) {
  const invoice = await prisma.invoice.findFirst({
    where,
    select: {
      invoiceNumber: true,
      status: true,
      issuedAt: true,
      dueDate: true,
      currency: true,
      freightCost: true,
      freightOverride: true,
      /* The rate agreed for this consignment, so the customer's own copy of
         the bill can show the working — see freightNote below. */
      freightRateOverride: true,
      /* The unit it is in and what it multiplied, where the desk moved it
         off the book's — see Invoice.freightRateQuantity. */
      freightRateMethod: true,
      freightRateQuantity: true,
      storageCharge: true,
      storageDays: true,
      storageWaivedUsd: true,
      otherCharges: true,
      discount: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
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
          /* What the rate book charged and what it charged it on, so the
             agreed rate can be printed with the standard one beside it. */
          quotedRate: true,
          quotedMethod: true,
          chargeableKg: true,
          packageType: true,
          origin: true,
          cargoCategory: true,
          cargoType: { select: { name: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });

  if (!invoice) return null;

  const total = toNumber(invoice.total);
  const paid = toNumber(invoice.amountPaid);

  return {
    status: invoice.status,
    fileName: invoiceFileName(
      invoice.customer.name,
      invoice.shipment.trackingNumber
    ),
    input: {
      invoiceNumber: invoice.invoiceNumber,
      /* Dates in English on a WinAnsi PDF.

         The renderer strips every codepoint the font cannot draw, and a Chinese
         date — 2026年9月7日 — loses its 年月日 and arrives as digit soup: "202697".
         The document is Latin-only by construction, so the date is composed that
         way rather than sanitised afterwards. */
      issuedOn: formatDate(invoice.issuedAt, "en"),
      dueOn: invoice.dueDate ? formatDate(invoice.dueDate, "en") : null,
      status: invoice.status,

      customerName: invoice.customer.name,
      customerPhone: invoice.customer.phone,
      customerCity: invoice.customer.city,

      trackingNumber: invoice.shipment.trackingNumber,
      batchNumber: invoice.shipment.batch?.batchNumber ?? null,
      // The cargo description in English whoever opens the file: the document
      // is drawn in a font with no Chinese in it, and the customer holding it
      // in Dar did not type 手机配件.
      description: latinLabel(
        cargoText("en", invoice.shipment, "description"),
        invoice.shipment.cargoType?.name ??
          CATEGORY_LABELS[invoice.shipment.cargoCategory]
      ),
      weightKg: toNumber(invoice.shipment.weightKg),
      packages: invoice.shipment.packages,
      packageType: invoice.shipment.packageType,
      routeLabel: `${AIRPORT_LABELS[invoice.shipment.origin]} → Dar es Salaam`,
      /* Through the same sieve as the description above — it is the same
         user-typed product name, and drawn by the same font that has no Chinese
         in it. Left raw, the Cargo row on the customer's invoice printed as an
         empty box. */
      cargoLabel: latinLabel(
        invoice.shipment.cargoType?.name ?? "",
        CATEGORY_LABELS[invoice.shipment.cargoCategory]
      ),

      currency: invoice.currency,
      /*
        HOW THAT FIGURE WAS REACHED, ON THE COPY THE CUSTOMER KEEPS.

        The bill on screen has always printed the rate and the quantity it was
        applied to; this document printed the route and a total. On a
        consignment carrying a rate somebody agreed that is the difference
        between a concession the customer can see and a number they cannot
        check — and the owner's rule is that a special rate is never hidden.

        Composed here rather than in the renderer, which does no arithmetic by
        design. The agreed rate leads and the book's follows it, so the figure
        can never read as what the cargo has always cost.
      */
      freightNote: (() => {
        const facts = rateFactsOf(invoice, invoice.shipment);
        const route = `${AIRPORT_LABELS[invoice.shipment.origin]} → Dar es Salaam`;
        if (facts.agreedRate === null) return route;
        const unit = facts.ratePerItem ? " each" : "/kg";
        /* The standard is quoted in the book's unit, which the desk may have
           switched away from — 40.00 each, not 40.00/kg. */
        const bookUnit = facts.bookPerItem ? " each" : "/kg";
        const applied = facts.ratePerItem
          ? `${facts.ratePricedOn} pcs`
          : `${facts.ratePricedOn} kg`;
        const standard =
          facts.standardRate === null ||
          (!facts.unitSwitched &&
            Math.abs(facts.standardRate - facts.agreedRate) < 0.005)
            ? ""
            : ` — special rate, standard ${invoice.currency} ${facts.standardRate.toFixed(2)}${bookUnit}`;
        /* Said on the customer's copy too: charged by the kilo on goods the
           price list sells by the piece is a departure they are entitled to see. */
        const switched = facts.unitSwitched
          ? facts.ratePerItem
            ? " (charged per item instead of per kg)"
            : " (charged per kg instead of per item)"
          : "";
        return `${route} · ${invoice.currency} ${facts.agreedRate.toFixed(2)}${unit} × ${applied}${switched}${standard}`;
      })(),
      // The figure that was actually billed, which is the override when Finance
      // set one — the same coalesce the total was computed from.
      freight:
        invoice.freightOverride === null
          ? toNumber(invoice.freightCost)
          : toNumber(invoice.freightOverride),
      storage: toNumber(invoice.storageCharge),
      storageDays: invoice.storageDays,
      storageWaived: toNumber(invoice.storageWaivedUsd),
      otherCharges: toNumber(invoice.otherCharges),
      discount: toNumber(invoice.discount),
      total,
      paid,
      /* Through the one helper, because this document goes to the CUSTOMER.
         Computed by hand it ignored what was written off: a bill settled at the
         counter printed "AMOUNT DUE TSh 450", stamped itself PART PAID, and —
         because the settled branch was skipped — reprinted every bank account
         and Lipa number underneath. An invitation to pay a debt that does not
         exist, into a live account. */
      outstanding: outstandingOf(invoice),

      exchangeRate:
        invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate),
      localCurrency: invoice.localCurrency,
      totalLocal:
        invoice.totalLocal === null ? null : toNumber(invoice.totalLocal),

      accounts: accountsForInvoice(invoice.paymentSnapshot),
    },
  };
}

/**
 * The document itself, as a file the browser saves.
 *
 * `extraHeaders` is for the public door, which asks search engines to leave a
 * customer's bill alone. The rest is the same for everybody.
 */
export function invoiceDocumentResponse(
  document: NonNullable<Awaited<ReturnType<typeof loadInvoiceDocument>>>,
  extraHeaders: Record<string, string> = {}
) {
  const pdf = renderInvoicePdf(document.input);

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
        `attachment; filename="${document.fileName.ascii}"; ` +
        `filename*=UTF-8''${encodeURIComponent(document.fileName.full)}`,
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
