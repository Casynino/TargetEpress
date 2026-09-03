import { NextResponse } from "next/server";

import { cardFileName, pdfHeaders } from "@/lib/card-pdf";
import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { combinedBillToPdf } from "@/lib/receipt-pdf";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

/**
 * EVERYTHING ONE CUSTOMER OWES, ON ONE PIECE OF PAPER.
 *
 * A customer with four consignments has four invoices, and sending four of them
 * asks four questions when they have one: "how much do I pay?" This answers it
 * — every open bill, each with its own tracking number and its own frozen rate,
 * and one total to transfer.
 *
 * It does not replace the invoices and does not change them. Each consignment
 * keeps its own bill, its own price and its own paperwork; this is a covering
 * statement of them, which is exactly what "billed together" means here. The
 * cargo is not merged, the batches are untouched, and paying against this
 * settles each bill in its own right.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("finance.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      name: true,
      code: true,
      phone: true,
      invoices: {
        where: { status: { in: [...BILLED_INVOICE_STATUSES] } },
        orderBy: { issuedAt: "asc" },
        select: {
          invoiceNumber: true,
          issuedAt: true,
          currency: true,
          exchangeRate: true,
          total: true,
          amountPaid: true,
          shipment: {
            select: {
              trackingNumber: true,
              packages: true,
              weightKg: true,
              ...selectText("description"),
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  /* Settled bills are left off: this is a statement of what is owed, and a
     list of bills needing nothing is noise in front of the figure. */
  const open = customer.invoices.filter(
    (invoice) => toNumber(invoice.total) - toNumber(invoice.amountPaid) > 0.005
  );

  if (open.length === 0) {
    return NextResponse.json(
      { error: "This customer has nothing outstanding." },
      { status: 409 }
    );
  }

  const pdf = combinedBillToPdf({
    customerName: customer.name,
    customerCode: customer.code,
    customerPhone: customer.phone,
    lines: open.map((invoice) => {
      const outstanding =
        toNumber(invoice.total) - toNumber(invoice.amountPaid);
      const frozen = toNumber(invoice.exchangeRate);
      return {
        trackingNumber: invoice.shipment.trackingNumber,
        description: cargoText(locale, invoice.shipment, "description"),
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        packages: invoice.shipment.packages,
        weightKg: toNumber(invoice.shipment.weightKg),
        currency: invoice.currency,
        total: toNumber(invoice.total),
        paid: toNumber(invoice.amountPaid),
        outstanding,
        exchangeRate: frozen || null,
        /* Each bill at ITS OWN frozen rate — two consignments priced a
           fortnight apart carry two, and both are what that customer was
           quoted. */
        outstandingLocal: frozen ? Math.round(outstanding * frozen) : null,
      };
    }),
    locale,
  });

  return new NextResponse(pdf as BodyInit, {
    headers: pdfHeaders(
      cardFileName(customer.name, customer.code, "Statement")
    ),
  });
}
