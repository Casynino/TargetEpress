import { NextResponse } from "next/server";

import { cardFileName, pdfHeaders } from "@/lib/card-pdf";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { combinedReceiptToPdf } from "@/lib/receipt-pdf";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

/**
 * The receipt for one payment, listing every consignment it settled.
 *
 * Addressed by the RECEIPT number rather than the payment id, because that is
 * the string on the customer's copy and the one somebody types into a search
 * box six weeks later. A cuid also works, for links built from a record.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("finance.view");
  const locale = await viewerLocale();
  const { id } = await params;
  const key = decodeURIComponent(id);

  const receipt = await prisma.receipt.findFirst({
    where: key.startsWith("RCT-")
      ? { receiptNumber: key.toUpperCase() }
      : { id: key },
    select: {
      receiptNumber: true,
      issuedBy: { select: { name: true } },
      payment: {
        select: {
          amount: true,
          currency: true,
          method: true,
          reference: true,
          paidAt: true,
          voidedAt: true,
          account: { select: { name: true } },
          receivedBy: { select: { name: true } },
          customer: { select: { name: true, code: true, phone: true } },
          /* The bill this payment was raised against, for a payment taken
             before allocations existed — its receipt must still print. */
          invoice: {
            select: {
              invoiceNumber: true,
              currency: true,
              total: true,
              amountPaid: true,
              exchangeRate: true,
              shipment: {
                select: {
                  trackingNumber: true,
                  batch: { select: { batchNumber: true } },
                  ...selectText("description"),
                },
              },
            },
          },
          allocations: {
            orderBy: { createdAt: "asc" },
            select: {
              amount: true,
              invoice: {
                select: {
                  invoiceNumber: true,
                  currency: true,
                  total: true,
                  amountPaid: true,
                  exchangeRate: true,
                  shipment: {
                    select: {
                      trackingNumber: true,
                      batch: { select: { batchNumber: true } },
                      ...selectText("description"),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!receipt?.payment) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  const payment = receipt.payment;
  if (payment.voidedAt) {
    return NextResponse.json(
      { error: "That payment was cancelled. Its receipt is not valid." },
      { status: 409 }
    );
  }

  const tenderedCurrency = payment.currency;

  /*
    Allocations are the truth. A payment taken before they existed carries only
    the invoice it was raised against, so that is printed instead of an empty
    document — the receipt in the customer's hand has to exist either way.
  */
  const rows =
    payment.allocations.length > 0
      ? payment.allocations.map((allocation) => ({
          settled: toNumber(allocation.amount),
          invoice: allocation.invoice,
        }))
      : payment.invoice
        ? [{ settled: toNumber(payment.amount), invoice: payment.invoice }]
        : [];

  const lines = rows.map(({ settled, invoice }) => {
    const frozen = toNumber(invoice.exchangeRate);
    const cross = invoice.currency !== tenderedCurrency;
    return {
      trackingNumber: invoice.shipment.trackingNumber,
      description: cargoText(locale, invoice.shipment, "description"),
      invoiceNumber: invoice.invoiceNumber,
      batchNumber: invoice.shipment.batch?.batchNumber ?? null,
      settled,
      currency: invoice.currency,
      /* What this line consumed of what was handed over, at the bill's own
         frozen rate. Two lines may carry two rates without either being wrong. */
      tendered:
        !cross || !frozen
          ? null
          : tenderedCurrency === "TZS"
            ? Math.round(settled * frozen)
            : Math.round((settled / frozen) * 100) / 100,
      exchangeRate: cross ? (frozen || null) : null,
      cleared:
        toNumber(invoice.amountPaid) + 0.001 >= toNumber(invoice.total),
    };
  });

  /* Derived, like every figure here: what arrived, less what it answered. */
  const answered = lines.reduce(
    (sum, line) => sum + (line.tendered ?? line.settled),
    0
  );
  const heldAsCredit = Math.max(0, toNumber(payment.amount) - answered);

  const pdf = combinedReceiptToPdf({
    receiptNumber: receipt.receiptNumber,
    paidAt: payment.paidAt,
    customerName: payment.customer?.name ?? "Customer",
    customerCode: payment.customer?.code ?? "",
    customerPhone: payment.customer?.phone ?? null,
    tendered: { amount: toNumber(payment.amount), currency: tenderedCurrency },
    method: payment.method,
    reference: payment.reference,
    account: payment.account?.name ?? null,
    receivedBy: payment.receivedBy?.name ?? receipt.issuedBy?.name ?? null,
    lines,
    heldAsCredit,
    locale,
  });

  return new NextResponse(pdf as BodyInit, {
    headers: pdfHeaders(
      cardFileName(
        payment.customer?.name ?? "Customer",
        receipt.receiptNumber,
        "Receipt"
      )
    ),
  });
}
