import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BackLinkButton } from "@/components/app/back-link-button";
import { PickupSlip, type PickupSlipData } from "@/components/app/pickup-slip";
import { PrintBar } from "@/components/app/print-bar";
import { formatPackages } from "@/lib/constants";
import { invoiceCredit } from "@/lib/credit-queries";
import { formatDate, formatMoney, formatWeight, toNumber } from "@/lib/format";
import { formatShillings, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { SLIP_MM } from "@/lib/print";
import { shipmentQrDataUrl } from "@/lib/qr";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { outstandingOf } from "@/lib/invoice-balance";

export const metadata: Metadata = { title: "Pickup note" };

export default async function PickupNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Support prints the note Finance issued. Issuing one is pickupNote.issue
  // and is checked in the action, not here.
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
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              storageCharge: true,
              storageWaivedUsd: true,
              /* Outstanding is derived, never stored — so the stamp is read
                 from the bill at the moment the card is drawn, and a payment
                 reversed since it was issued takes the green with it. */
              total: true,
              amountPaid: true,
              amountAdjusted: true,
            },
          },
        },
      },
    },
  });

  if (!note) notFound();

  // The note carries the SHIPMENT's QR — the same code the warehouse will scan
  // on the carton. One identity, both documents.
  //
  // 640px into a 54mm square is ~301dpi — a 45-module code (data plus quiet
  // zone) lands at 1.2mm per module, which a phone locks onto instantly.
  //
  // Alongside it, whether this cargo was actually paid for. The note's own
  // `amountPaid` cannot answer that: it is a snapshot of what was settled the
  // moment it was issued, which on a credit release is nothing, so the question
  // goes to the invoice through the one query layer that derives it.
  const [qr, credit] = await Promise.all([
    shipmentQrDataUrl(note.shipment.qrToken, 640),
    note.shipment.invoice
      ? invoiceCredit(note.shipment.invoice.id)
      : Promise.resolve(null),
  ]);

  /*
    A credit release is not a payment.

    The slip said "Paid in full" whichever way the cargo left, because issuing a
    note used to be the act of confirming money had arrived. Credit made that
    sentence false on a document the customer keeps — so an open credit prints
    what is still owed and when it is due, and a credit the customer has since
    settled goes back to the paid wording, because by then it is true.
  */
  const pendingCredit = credit !== null && credit.state !== "PAID" ? credit : null;
  /* Forgiven, not paid and not chased: no date, no figure, and never green. */
  const waived = pendingCredit?.state === "WAIVED";

  /* Storage is the one charge argued about at the counter — it grew while the
     customer was not looking — so the slip records what it was, or that it was
     forgiven, and says nothing at all when the clock never ran. */
  const storageCharged = toNumber(note.shipment.invoice?.storageCharge ?? 0);
  const storageWaived = toNumber(note.shipment.invoice?.storageWaivedUsd ?? 0);

  /*
    Does this card still say something true?

    The stamp was green whenever there was no open credit, because issuing a
    note used to be the last word on the money. It is not: a payment can be
    cancelled afterwards, and the note itself can be cancelled outright — and
    both happened on the same consignment, leaving a card stamped CANCELLED
    across the top and PAID IN FULL in green underneath. The customer reads the
    green.
  */
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
  const settled = note.status !== "CANCELLED" && moneyIn;

  const data: PickupSlipData = {
    noteNumber: note.noteNumber,
    status: note.status,
    issuedOn: formatDate(note.issuedAt, locale),
    trackingNumber: note.shipment.trackingNumber,
    customerName: note.customer.name,
    customerPhone: note.customer.phone,
    storageLabel:
      storageWaived > 0
        ? `USD ${storageWaived.toFixed(2)}`
        : storageCharged > 0
          ? `USD ${storageCharged.toFixed(2)}`
          : null,
    storageWaived: storageWaived > 0,
    description: cargoText(locale, note.shipment, "description"),
    weightLabel: formatWeight(note.shipment.weightKg),
    packagesLabel: formatPackages(
      note.shipment.packages,
      note.shipment.packageType
    , locale),
    invoiceNumber: note.shipment.invoice?.invoiceNumber ?? null,
    settled,
    paymentStatus:
      note.status === "CANCELLED"
        ? t(locale, "Cancelled — this note is not valid")
        : pendingCredit === null
          ? moneyIn
            ? t(locale, "Paid in full")
            : t(locale, "Payment not received")
          : waived
            ? t(locale, "Written off")
            : t(locale, "Credit — payment pending"),
    /*
      The figure only for the desks allowed one.

      A slip goes to the customer, who is entitled to see what they paid — but
      it is printed and reprinted from a staff screen, and the warehouse rule
      is that its people read the payment FACT and never the amount. "Paid in
      full" is the sentence that matters at the counter either way.

      An open credit is the exception, because there the amount IS the fact:
      "payment pending" with no figure tells a customer nothing about what they
      have to bring back. It is also not a widening — every desk that can open a
      pickup note holds credit.view, so the credit book already shows them this
      figure. And it comes off the invoice rather than off the note, whose
      `amountPaid` froze at nothing on the day the cargo left.
    */
    amountLabel:
      credit === null
        ? can(user.role, "finance.view")
          ? formatMoney(note.amountPaid, note.currency)
          : null
        : waived
          ? null
          : /* Shillings lead, at THIS bill's own frozen rate — the customer was
               quoted a shilling figure and it must not move with the market. */
            formatShillings(
              pendingCredit === null ? credit.paidUsd : credit.outstandingUsd,
              credit.exchangeRate
            ),
    credit:
      pendingCredit === null
        ? null
        : {
            /* A written-off bill keeps the warning treatment and loses the rest
               of the block: it was never paid, but there is no date to meet and
               nobody is chasing it, and `daysOverdue` still counts up on it
               long after the company stopped expecting the money. */
            dueOn:
              waived || pendingCredit.dueDate === null
                ? null
                : formatDate(pendingCredit.dueDate, locale),
            overdue: !waived && pendingCredit.daysOverdue > 0,
            /* The dollars beside the shillings, and only when the bill carries a
               rate — with none published there was nothing to convert, so the
               figure above is already in dollars and repeating it says nothing. */
            amountUsd:
              waived || pendingCredit.exchangeRate === null
                ? null
                : formatUsd(pendingCredit.outstandingUsd),
          },
    qr,
  };

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="no-print">
        <BackLinkButton
          fallbackHref="/app/finance/pickup-notes"
          fallbackLabel="All pickup notes"
        />
      </div>

      <PrintBar
        item={SLIP_MM}
        printLabel={t(locale, "Print pickup note")}
        downloadHref={`/app/finance/pickup-notes/${id}/pdf`}
        hint={t(locale, "Print it for the customer, or send them the file.")}
      />

      {/* A scroll frame, not a centring one. The sheet is a fixed 100mm
          (~378px) and cannot shrink, so on a narrower phone centring split
          the overflow evenly and the left half went behind x=0, where no
          scroll can reach it. Printing is unaffected. */}
      <div className="-mx-4 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0">
        <div className="mx-auto flex w-max justify-center">
          <PickupSlip data={data} />
        </div>
      </div>

    </div>
  );
}
