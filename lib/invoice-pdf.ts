import "server-only";

import { jsPDF } from "jspdf";

import {
  COMPANY,
  PAYMENT_ACCOUNTS,
  STORAGE_POLICY,
  formatPackages,
} from "@/lib/constants";

/**
 * The invoice as a file a customer can be sent.
 *
 * Drawn rather than screenshotted. The alternative was to render the existing
 * print-styled page through headless Chrome, which means shipping a browser to
 * production to lay out a page of text — a heavy, slow dependency for a
 * document that is a header, a table and a list of bank accounts.
 *
 * Everything here is passed in already formatted. This module does no
 * arithmetic and reads no database: an invoice is a statement of figures that
 * were agreed at a point in time, and a document that re-derives them can
 * disagree with the record it claims to represent.
 */

export type InvoicePdfInput = {
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string | null;
  status: string;

  customerName: string;
  customerPhone: string | null;
  customerCity: string | null;

  trackingNumber: string;
  batchNumber: string | null;
  description: string;
  weightKg: number;
  packages: number;
  packageType: string;

  currency: string;
  freight: number;
  storage: number;
  storageDays: number;
  otherCharges: number;
  discount: number;
  total: number;
  paid: number;
  outstanding: number;

  exchangeRate: number | null;
  localCurrency: string;
  totalLocal: number | null;
};

const MARGIN = 48;
const PAGE_WIDTH = 595; // A4 at 72dpi
const RIGHT = PAGE_WIDTH - MARGIN;

function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function renderInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const text = (
    value: string,
    x: number,
    size = 10,
    style: "normal" | "bold" = "normal",
    align: "left" | "right" = "left"
  ) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.text(value, x, y, { align });
  };

  // --- Header -------------------------------------------------------------
  text(COMPANY.name.toUpperCase(), MARGIN, 16, "bold");
  text("INVOICE", RIGHT, 16, "bold", "right");
  y += 16;
  text(COMPANY.taglineEn, MARGIN, 9);
  text(input.invoiceNumber, RIGHT, 11, "bold", "right");
  y += 13;
  text(`${COMPANY.phone}  ·  ${COMPANY.email}`, MARGIN, 9);
  text(`Issued ${input.issuedOn}`, RIGHT, 9, "normal", "right");
  y += 12;
  if (input.dueOn) {
    text(`Due ${input.dueOn}`, RIGHT, 9, "normal", "right");
    y += 12;
  }

  y += 8;
  doc.setDrawColor(210);
  doc.line(MARGIN, y, RIGHT, y);
  y += 22;

  // --- Who it is for ------------------------------------------------------
  text("BILL TO", MARGIN, 8, "bold");
  text("CARGO", 320, 8, "bold");
  y += 14;
  text(input.customerName, MARGIN, 11, "bold");
  text(input.trackingNumber, 320, 11, "bold");
  y += 13;
  if (input.customerPhone) text(input.customerPhone, MARGIN, 9);
  if (input.batchNumber) text(`Shipment ${input.batchNumber}`, 320, 9);
  y += 12;
  if (input.customerCity) text(input.customerCity, MARGIN, 9);
  text(
    `${input.weightKg.toFixed(1)} kg  ·  ${formatPackages(
      input.packages,
      input.packageType as never
    )}`,
    320,
    9
  );
  y += 22;

  // Cargo description can be long and is the customer's own wording.
  const description = doc.splitTextToSize(input.description, RIGHT - MARGIN);
  text("GOODS", MARGIN, 8, "bold");
  y += 13;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(description, MARGIN, y);
  y += description.length * 13 + 14;

  // --- The figures --------------------------------------------------------
  doc.setFillColor(244, 244, 245);
  doc.rect(MARGIN, y - 12, RIGHT - MARGIN, 22, "F");
  text("DESCRIPTION", MARGIN + 8, 8, "bold");
  text("AMOUNT", RIGHT - 8, 8, "bold", "right");
  y += 24;

  const line = (label: string, amount: number) => {
    text(label, MARGIN + 8, 10);
    text(money(amount, input.currency), RIGHT - 8, 10, "normal", "right");
    y += 18;
  };

  line("Air freight, China → Dar es Salaam", input.freight);
  if (input.storage > 0) {
    line(
      `Storage — ${input.storageDays} chargeable day(s) at ${STORAGE_POLICY.currency} ${STORAGE_POLICY.perDayUsd}/day`,
      input.storage
    );
  }
  if (input.otherCharges > 0) line("Additional charges", input.otherCharges);
  if (input.discount > 0) line("Discount", -input.discount);

  y += 4;
  doc.line(MARGIN, y, RIGHT, y);
  y += 20;

  text("TOTAL", MARGIN + 8, 12, "bold");
  text(money(input.total, input.currency), RIGHT - 8, 12, "bold", "right");
  y += 16;

  if (input.totalLocal !== null && input.exchangeRate !== null) {
    text(
      `at ${input.exchangeRate.toLocaleString()} ${input.localCurrency}/${input.currency}`,
      MARGIN + 8,
      8
    );
    text(
      `${input.localCurrency} ${Math.round(input.totalLocal).toLocaleString()}`,
      RIGHT - 8,
      10,
      "normal",
      "right"
    );
    y += 18;
  }

  if (input.paid > 0) {
    line("Received", -input.paid);
    text("OUTSTANDING", MARGIN + 8, 11, "bold");
    text(
      money(input.outstanding, input.currency),
      RIGHT - 8,
      11,
      "bold",
      "right"
    );
    y += 18;
  }

  y += 14;

  // --- How to pay ---------------------------------------------------------
  text("HOW TO PAY", MARGIN, 8, "bold");
  y += 14;
  // Read off the invoice's own snapshot when it has one — see
  // accountsForInvoice. An invoice raised before snapshots existed falls back
  // to the constants, which is what it was printed with.
  for (const m of PAYMENT_ACCOUNTS.mobileMoney) {
    text(`${m.provider}  ${m.number}  —  ${m.accountName}`, MARGIN, 9);
    y += 12;
  }
  for (const b of PAYMENT_ACCOUNTS.banks) {
    for (const a of b.accounts) {
      text(`${b.bank} (${a.currency})  ${a.number}  —  ${b.accountName}`, MARGIN, 9);
      y += 12;
    }
  }

  y += 10;
  text("TERMS", MARGIN, 8, "bold");
  y += 13;
  const terms = doc.splitTextToSize(
    `Payable in full before cargo is released. ${STORAGE_POLICY.text.join(" ")}`,
    RIGHT - MARGIN
  );
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(terms, MARGIN, y);
  y += terms.length * 11 + 8;

  // The figure moves, and saying so is the reason to collect early.
  const note = doc.splitTextToSize(
    "This amount can change: storage is charged daily once the free window closes, and the shilling figure follows the exchange rate on the day of payment.",
    RIGHT - MARGIN
  );
  doc.text(note, MARGIN, y);

  return new Uint8Array(doc.output("arraybuffer"));
}
