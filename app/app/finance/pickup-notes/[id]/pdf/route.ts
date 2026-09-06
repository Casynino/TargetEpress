import { NextResponse } from "next/server";

import { cardFileName, pdfHeaders, renderPickupSlipPdf } from "@/lib/card-pdf";
import { COMPANY, formatPackages } from "@/lib/constants";
import { formatDate, formatMoney, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { invoiceCredit } from "@/lib/credit-queries";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { localSplit, outstandingOf } from "@/lib/invoice-balance";

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
          /* Outstanding is derived at read time, so the stamp on the copy the
             customer keeps reflects the bill now — not what it said the day
             the note was printed. */
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              amountPaid: true,
              amountAdjusted: true,
              /* The card leads in shillings — that is the money the customer
                 handed over and the money they remember. */
              exchangeRate: true,
              /*
                WHAT ACTUALLY ARRIVED, IN THE MONEY IT ARRIVED IN.

                The bill is written in dollars, so amountPaid is 145,300
                shillings rounded to 53.81 — and 53.81 multiplied back out is
                145,287. Thirteen shillings the customer never lost, printed on
                the card they keep. Where every live payment came in shillings
                the card states those shillings, and what was cleared is the
                remainder of the bill, so the two figures add up to it exactly.
              */
              payments: {
                where: { voidedAt: null },
                select: { amount: true, currency: true },
              },
            },
          },
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

  /* Null unless this consignment actually went out on credit, so an ordinary
     settled note keeps its settled wording untouched. */
  /*
    THROUGH THE ONE HELPER, BECAUSE THIS CARD GOES TO THE CUSTOMER.

    Subtracting only the money ignores what was written off, so a bill settled
    at the counter — 36,000 handed over on a 36,450 bill with the last 450
    cleared — printed PAYMENT NOT RECEIVED on the card sam brings back to
    collect his cargo. The bill was paid; the note said it was not.
  */
  const outstanding = note.shipment.invoice
    ? outstandingOf(note.shipment.invoice)
    : 0;
  const moneyIn = note.shipment.invoice !== null && outstanding <= 0.005;

  const credit = note.shipment.invoice
    ? await invoiceCredit(note.shipment.invoice.id)
    : null;

  /*
    THE CARD LEADS IN SHILLINGS, AND SAYS WHAT WAS CLEARED.

    It showed "USD 13.33" — the dollars actually received — beside the words
    PAID IN FULL on a bill of USD 13.50. Two problems in one line: the money
    the customer counted out was shillings, and the 450 that was written off
    appeared nowhere, so the card could not explain why 13.33 settles 13.50.

    The bill's own figure leads, in shillings. Underneath, when something was
    written off, the split: what was paid, what was cleared, and the dollars
    the bill is denominated in.
  */
  const inv = note.shipment.invoice;
  const noteRate = inv?.exchangeRate ? toNumber(inv.exchangeRate) : null;
  const tsh = (usd: number) =>
    noteRate ? `TSh ${Math.round(usd * noteRate).toLocaleString("en-US")}` : null;
  const billUsd = toNumber(inv?.total ?? 0);
  const paidUsd = toNumber(inv?.amountPaid ?? 0);
  const clearedUsd = toNumber(inv?.amountAdjusted ?? 0);
  /* The three shilling figures that add up — see localSplit. */
  const split = inv
    ? localSplit(inv)
    : { billLocal: null, paidLocal: null, clearedLocal: null };
  const paidShown =
    split.paidLocal !== null
      ? `TSh ${split.paidLocal.toLocaleString("en-US")}`
      : tsh(paidUsd) ?? formatMoney(paidUsd, "USD");
  const clearedShown =
    split.clearedLocal !== null
      ? `TSh ${split.clearedLocal.toLocaleString("en-US")}`
      : tsh(clearedUsd) ?? formatMoney(clearedUsd, "USD");
  const settledLabel = tsh(billUsd) ?? formatMoney(billUsd, "USD");
  const settledNote =
    clearedUsd > 0.005
      ? [
          `${paidShown} paid`,
          `${clearedShown} cleared`,
          formatMoney(billUsd, "USD"),
        ].join(" \u00b7 ")
      : formatMoney(billUsd, "USD");

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
    , locale),
    invoiceNumber: note.shipment.invoice?.invoiceNumber ?? null,
    // Left in English on purpose: the card is drawn by jsPDF's WinAnsi
    // Helvetica, which drops CJK rather than substituting it, so a translated
    // stamp would print as an empty band. The whole card is English for that
    // reason — see winAnsi() in lib/card-pdf.
    /*
      What this bill actually is, not what it usually is.

      This said "Paid in full" unconditionally, so the copy the customer keeps
      stamped it on a consignment released on credit — the exact thing the rule
      exists to prevent, on the more widely seen of the two documents.
    */
    /*
      What this bill actually is, right now.

      "Paid in full" whenever there was no open credit put a green PAID stamp on
      a card that had been cancelled and whose payment had been reversed — on
      the more widely seen of the two documents, and the one the customer brings
      back to the counter.
    */
    paymentStatus:
      note.status === "CANCELLED"
        ? "Cancelled — this note is not valid"
        : credit
          ? credit.state === "WAIVED"
            ? "Written off"
            : "Credit — payment pending"
          : moneyIn
            ? "Paid in full"
            : "Payment not received",
    credit: credit
      ? {
          dueOn: credit.dueDate ? formatDate(credit.dueDate, locale) : null,
          overdue: credit.state === "OVERDUE",
        }
      : null,
    // The figure only for the desks allowed one — the warehouse reads the
    // payment fact and never the amount, the same gate the screen applies.
    /*
      On a credit release the figure IS the fact: "payment pending" with no
      number tells the customer nothing to bring back. And PickupNote.amountPaid
      freezes at whatever was settled when the note was issued, which on a credit
      is nothing — so the amount comes from the live derived figure instead.
    */
    amountLabel: credit
      ? credit.state === "WAIVED"
        ? null
        : tsh(credit.outstandingUsd) ?? formatMoney(credit.outstandingUsd, "USD")
      : can(user.role, "finance.view")
        ? settledLabel
        : null,
    /* The second line under the band. Only where there is something the top
       line cannot say on its own — the dollars behind the shillings, and the
       part of the bill that was cleared rather than paid. */
    amountNote: credit
      ? formatMoney(credit.outstandingUsd, "USD")
      : can(user.role, "finance.view")
        ? settledNote
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
