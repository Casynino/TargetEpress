import "server-only";

import { PAYMENT_METHODS, storageNotice } from "@/lib/constants";
import {
  INK,
  MUTED,
  NAVY,
  RED,
  createSheet,
} from "@/lib/pdf-kit";
import { latinLabel } from "@/lib/manifest-pdf";

export type CombinedReceiptInput = {
  receiptNumber: string;
  paidAt: Date;
  customerName: string;
  customerCode: string;
  customerPhone: string | null;
  /** What actually arrived, in the money it arrived in. */
  tendered: { amount: number; currency: string };
  reference: string | null;
  account: string | null;
  receivedBy: string | null;
  /** One line per consignment this payment answered. */
  lines: {
    trackingNumber: string;
    description: string;
    invoiceNumber: string;
    /** The flight it came on. */
    batchNumber: string | null;
    /** Settled against the bill, in the bill's own currency. */
    settled: number;
    currency: string;
    /** What that came to in the money handed over, when they differ. */
    tendered: number | null;
    exchangeRate: number | null;
    /** Whether this bill is now clear. */
    cleared: boolean;
  }[];
  /** Money received that no bill has claimed — held as the customer's credit. */
  heldAsCredit: number;
  locale: "en" | "zh";
};

/**
 * ONE PAYMENT, EVERY CONSIGNMENT IT SETTLED, ON ONE PIECE OF PAPER.
 *
 * A customer sends one transfer for four consignments. Handing them four
 * receipts describes four payments — which is what the counter used to have to
 * do, and what the combined screen exists to stop. It also leaves the customer
 * unable to answer the only question they have: "is all of it paid for?"
 *
 * So the document leads with what arrived, then lists what it answered, one
 * line per consignment with its tracking number, its bill and whether that bill
 * is now clear. Anything left over is named as their credit rather than
 * silently missing from the arithmetic.
 *
 * Both currencies where they differ, because the customer sent shillings and
 * every bill is written in dollars: the rate on each line is the one frozen
 * onto that bill, and two lines can carry two rates without either being wrong.
 *
 * Latin text throughout — the PDF fonts are WinAnsi and drop Chinese silently,
 * so a consignment described in Chinese falls back to its cargo type rather
 * than printing an empty cell.
 */
export function combinedReceiptToPdf(input: CombinedReceiptInput) {
  const money = (amount: number, currency: string) =>
    `${currency === "TZS" ? "TSh" : currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: currency === "TZS" ? 0 : 2,
      maximumFractionDigits: currency === "TZS" ? 0 : 2,
    })}`;

  const cross = input.lines.some(
    (line) => line.currency !== input.tendered.currency
  );

  const sheet = createSheet({
    kind: "Receipt",
    title: input.receiptNumber,
    subtitle: `${input.customerName} · ${input.customerCode}`,
    caption:
      input.lines.length > 1
        ? "One payment, settling every consignment listed below. The account moved once."
        : "One payment against the consignment listed below.",
    reference: input.receiptNumber,
    facts: [
      { label: "Received", value: money(input.tendered.amount, input.tendered.currency) },
      { label: "Paid on", value: input.paidAt.toISOString().slice(0, 10) },
      ...(input.reference ? [{ label: "Reference", value: input.reference }] : []),
      /* Unconditional now that every payment names one. A receipt is the thing
         a customer waves in an argument, so "Into" saying nothing is worse than
         "Into" saying the account was never recorded — which only historic
         payments can do. It replaces a "Method" line that told the customer
         their mobile money was mobile money. */
      { label: "Into", value: input.account ?? "not recorded" },
      ...(input.customerPhone
        ? [{ label: "Phone", value: input.customerPhone }]
        : []),
    ],
  });

  sheet.heading();

  sheet.table({
    columns: [
      { key: "cargo", label: "Cargo", min: 70 },
      { key: "goods", label: "Goods", min: 90 },
      { key: "invoice", label: "Bill", min: 78 },
      { key: "flight", label: "Flight", min: 56 },
      ...(cross
        ? [
            { key: "rate", label: "Rate", numeric: true },
            { key: "paid", label: `Paid (${input.tendered.currency === "TZS" ? "TSh" : input.tendered.currency})`, numeric: true },
          ]
        : []),
      { key: "settled", label: "Settled", numeric: true },
      { key: "state", label: "Status" },
    ],
    rows: input.lines.map((line) => [
      line.trackingNumber,
      latinLabel(line.description, "Goods"),
      line.invoiceNumber,
      line.batchNumber ?? "—",
      ...(cross
        ? [
            line.exchangeRate ? line.exchangeRate.toLocaleString("en-US") : "—",
            line.tendered === null
              ? "—"
              : money(line.tendered, input.tendered.currency),
          ]
        : []),
      money(line.settled, line.currency),
      line.cleared ? "Paid in full" : "Part paid",
    ]),
    totals: [
      "",
      "",
      "",
      "",
      ...(cross ? ["", money(input.tendered.amount, input.tendered.currency)] : []),
      money(
        input.lines.reduce((sum, line) => sum + line.settled, 0),
        input.lines[0]?.currency ?? input.tendered.currency
      ),
      "",
    ],
    note: cross
      ? "Each bill converted at the exchange rate frozen onto it when it was raised, which is the rate the customer was quoted for that consignment."
      : undefined,
  });

  if (input.heldAsCredit > 0.005) {
    sheet.y += 6;
    sheet.put(
      `${money(input.heldAsCredit, input.tendered.currency)} of this payment answers no bill yet and is held as ${input.customerName}'s credit. It settles their next consignment automatically when it is priced at Dar.`,
      sheet.geometry.MARGIN,
      sheet.y,
      { size: 8.5 }
    );
    sheet.y += 14;
  }

  sheet.signature(input.receivedBy ?? "Target Express Air Cargo");
  return sheet.finish();
}

export function receiptFileName(receiptNumber: string) {
  return `${receiptNumber}.pdf`;
}

export type CombinedBillInput = {
  customerName: string;
  customerCode: string;
  customerPhone: string | null;
  lines: {
    trackingNumber: string;
    description: string;
    invoiceNumber: string;
    issuedAt: Date;
    packages: number;
    weightKg: number;
    /** The flight it came on, so the customer can tie a line to a shipment. */
    batchNumber: string | null;
    currency: string;
    total: number;
    paid: number;
    outstanding: number;
    exchangeRate: number | null;
    outstandingLocal: number | null;
  }[];
  locale: "en" | "zh";
};

/**
 * EVERYTHING ONE CUSTOMER OWES, AS ONE DOCUMENT THEY CAN PAY FROM.
 *
 * Four consignments means four invoices, and sending four of them asks four
 * questions when the customer has one: how much do I transfer? This answers it
 * once, and the counter can then take that single transfer against all four.
 *
 * A COVERING STATEMENT, NOT A REPLACEMENT. Each consignment keeps its own bill,
 * its own price, its own batch and its own paperwork — nothing is merged, which
 * is the whole design. Every line names its invoice so the customer can tie
 * this back to the document they already hold, and carries its own exchange
 * rate, because two consignments priced a fortnight apart were quoted at the
 * two rates published on those days and both are right.
 *
 * The shilling column is what the customer will actually send. It leads,
 * because nobody at this counter holds dollars.
 */
export function combinedBillToPdf(input: CombinedBillInput) {
  const usdTotal = input.lines.reduce((sum, line) => sum + line.outstanding, 0);
  const quotable = input.lines.every((line) => line.outstandingLocal !== null);
  const localTotal = quotable
    ? input.lines.reduce((sum, line) => sum + (line.outstandingLocal ?? 0), 0)
    : null;

  const usd = (amount: number) =>
    `USD ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const tsh = (amount: number) => `TSh ${Math.round(amount).toLocaleString("en-US")}`;

  const sheet = createSheet({
    kind: "Statement",
    title: "Amount due",
    subtitle: `${input.customerName} · ${input.customerCode}`,
    caption:
      "Every consignment of yours still awaiting payment. One transfer settles all of them — each keeps its own invoice and its own pickup note.",
    reference: input.customerCode,
    facts: [
      ...(localTotal !== null ? [{ label: "To pay", value: tsh(localTotal) }] : []),
      { label: localTotal !== null ? "In dollars" : "To pay", value: usd(usdTotal) },
      { label: "Consignments", value: String(input.lines.length) },
      ...(input.customerPhone
        ? [{ label: "Phone", value: input.customerPhone }]
        : []),
      { label: "As at", value: new Date().toISOString().slice(0, 10) },
    ],
  });

  sheet.heading();

  sheet.table({
    columns: [
      { key: "cargo", label: "Cargo", min: 68 },
      { key: "goods", label: "Goods", min: 80 },
      { key: "invoice", label: "Bill", min: 76 },
      { key: "flight", label: "Flight", min: 56 },
      { key: "weight", label: "Weight", numeric: true },
      { key: "usd", label: "Owed", numeric: true },
      ...(quotable
        ? [
            { key: "rate", label: "Rate", numeric: true },
            { key: "tsh", label: "Owed (TSh)", numeric: true },
          ]
        : []),
    ],
    rows: input.lines.map((line) => [
      line.trackingNumber,
      latinLabel(line.description, "Goods"),
      line.invoiceNumber,
      line.batchNumber ?? "—",
      `${line.weightKg} kg`,
      usd(line.outstanding),
      ...(quotable
        ? [
            line.exchangeRate?.toLocaleString("en-US") ?? "—",
            tsh(line.outstandingLocal ?? 0),
          ]
        : []),
    ]),
    totals: [
      "",
      "",
      "",
      "",
      "",
      usd(usdTotal),
      ...(quotable ? ["", tsh(localTotal ?? 0)] : []),
    ],
    note: quotable
      ? "Each consignment converted at the exchange rate frozen onto its bill when it was raised, which is the rate you were quoted for that cargo."
      : undefined,
  });

  const { doc, geometry } = sheet;
  const { MARGIN, RIGHT, CONTENT } = geometry;

  /* sheet.put draws a single unwrapped line, so anything sentence-length has
     to be split to the content width first — this paragraph was running off
     the right edge of the page and losing its last three words. */
  const paragraph = (text: string, size = 8.5, colour = INK) => {
    /* The font has to be set BEFORE the split: jsPDF measures against whatever
       size is current, so splitting first and sizing afterwards wraps to the
       wrong width and the last words fall off the right edge. */
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, CONTENT);
    sheet.need(lines.length * (size + 2) + 6);
    sheet.setInk(colour);
    doc.text(lines, MARGIN, sheet.y);
    sheet.y += lines.length * (size + 2) + 4;
  };

  sheet.y += 6;
  paragraph(
    "Paying the total above settles every consignment listed. You will receive one receipt naming all of them, and a pickup note for each cargo as it clears."
  );
  sheet.y += 6;

  /*
    HOW TO PAY.

    This document says "one transfer settles all of them" and then gave the
    customer nowhere to send it — no lipa number, no account, not even the
    counter address. The single invoice has carried them all along; a customer
    billed for four consignments at once was the one customer who had to ring
    the office to ask where the money goes.

    Same accounts, same grouping and same reference line as the invoice, so
    the two documents cannot come to disagree about where Target Express is
    paid.
  */
  const mobile = PAYMENT_METHODS.filter((a) => a.kind === "MOBILE");
  const banks = PAYMENT_METHODS.filter((a) => a.kind === "BANK");
  const cash = PAYMENT_METHODS.filter((a) => a.kind === "CASH");
  const rows = Math.max(mobile.length, banks.length);
  const payH = 40 + rows * 30 + (cash.length > 0 ? 34 : 0) + 8;
  sheet.need(payH + 24);

  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, sheet.y, CONTENT, payH, 5, 5, "S");
  sheet.put("HOW TO PAY", MARGIN + 14, sheet.y + 20, {
    size: 10,
    style: "bold",
    colour: NAVY,
  });
  /* One reference for the whole statement — the customer's own code, because
     no single tracking number covers every line on it. */
  sheet.put(
    `Quote ${input.customerCode} as the reference`,
    RIGHT - 14,
    sheet.y + 20,
    { size: 8, align: "right", colour: MUTED }
  );

  const account = (a: (typeof PAYMENT_METHODS)[number], x: number, top: number) => {
    sheet.put(a.label, x, top, { size: 7.5, style: "bold", colour: MUTED });
    sheet.put(a.number, x, top + 12, { size: 11, style: "bold", colour: NAVY });
    sheet.put(a.accountName, x, top + 21, { size: 7, colour: MUTED });
  };

  const colW = (CONTENT - 28) / 2;
  const top = sheet.y + 44;
  mobile.forEach((a, i) => account(a, MARGIN + 14, top + i * 30));
  banks.forEach((a, i) => account(a, MARGIN + 14 + colW + 4, top + i * 30));
  cash.forEach((a, i) => account(a, MARGIN + 14, top + rows * 30 + i * 30));
  sheet.y += payH + 18;

  /*
    The storage clock, in red and in both languages, Kiswahili first.

    Identical to the invoice's footing and for the same reason: it is the one
    part of this document that costs the customer money if it goes unread, and
    a customer holding only this statement was never shown it.
  */
  const notice = storageNotice();
  sheet.need(84);
  sheet.put(notice.sw.heading, MARGIN, sheet.y, {
    size: 8,
    style: "bold",
    colour: RED,
  });
  sheet.y += 11;
  /* Kiswahili first — the customer holding this reads Kiswahili; the English
     is for the forwarder and the file. One heading covers both. */
  for (const part of [notice.sw, notice.en]) {
    paragraph(part.body, 7.5, RED);
    sheet.y += 2;
  }

  /* The shilling figure is not a promise. Storage accrues daily and the rate
     moves, so a statement printed today can be short by the time it is paid. */
  sheet.y += 2;
  paragraph(
    "This amount can change: storage is charged daily once the free window closes, and the shilling figure follows the exchange rate on the day of payment.",
    7.5,
    MUTED
  );

  sheet.y += 6;
  sheet.signature("Target Express Air Cargo");
  return sheet.finish();
}
