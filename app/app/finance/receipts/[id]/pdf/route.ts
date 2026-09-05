import { NextResponse } from "next/server";

import { cardFileName, pdfHeaders } from "@/lib/card-pdf";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { combinedReceiptToPdf } from "@/lib/receipt-pdf";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { isSettled } from "@/lib/invoice-balance";

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
          /* The delivery half. It is inside `amount` above — that is what the
             customer's own transfer says — but it answers no bill and is not
             theirs to spend, so the receipt has to name it. */
          transportAmount: true,
          currency: true,
          reference: true,
          paidAt: true,
          voidedAt: true,
          transportSource: { select: { name: true } },
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
              amountAdjusted: true,
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
                  amountAdjusted: true,
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
      /* A bill closed by an adjustment IS cleared. Asking only whether the
         money covered the total printed "Part paid" on the receipt for the
         payment that finished it. */
      cleared: isSettled(invoice),
    };
  });

  /* Derived, like every figure here: what arrived, less what it answered. */
  const answered = lines.reduce(
    (sum, line) => sum + (line.tendered ?? line.settled),
    0
  );
  /*
    THE FARE IS NOT THE CUSTOMER'S CREDIT.

    This was "what arrived, less what it answered", and the delivery answers
    no bill — so a customer who paid 36,450 of freight and 10,000 of transport
    was handed a receipt saying the bill was settled in full AND that 10,000
    was being held as credit for next time. It was not: it had already gone to
    whoever drove. The business would have been asked for it twice.

    Taken off before the remainder is called credit, which is the same rule
    spareOf applies to the balance itself (lib/customer-credit.ts).
  */
  const fare = toNumber(payment.transportAmount);
  const heldAsCredit = Math.max(0, toNumber(payment.amount) - fare - answered);

  const pdf = combinedReceiptToPdf({
    receiptNumber: receipt.receiptNumber,
    paidAt: payment.paidAt,
    customerName: payment.customer?.name ?? "Customer",
    customerCode: payment.customer?.code ?? "",
    customerPhone: payment.customer?.phone ?? null,
    tendered: { amount: toNumber(payment.amount), currency: tenderedCurrency },
    /* Printed as its own line, so the customer can lay the receipt beside the
       transfer on their phone and see the one figure split into the two. */
    transport:
      fare > 0
        ? { amount: fare, from: payment.transportSource?.name ?? null }
        : null,
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
