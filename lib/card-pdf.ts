import "server-only";

import { jsPDF } from "jspdf";

import { BRAND_LOGO_PNG, BRAND_LOGO_RATIO } from "@/lib/brand-logo-png";
import { COMPANY } from "@/lib/constants";
import { LABEL_MM } from "@/lib/print";

/**
 * The cargo label and the pickup slip, as files.
 *
 * Drawn rather than screenshotted, the same way the invoice is: rendering the
 * print-styled page through headless Chrome means shipping a browser to
 * production to lay out a card that is a logo, eight fields and a QR.
 *
 * The page is the card — 100 x 150mm, no margins — so the downloaded file
 * prints identically to the browser's own print path. A PDF that comes out a
 * different size from the screen is worse than no download.
 *
 * Everything arrives already formatted. This module does no arithmetic and
 * reads no database.
 */

const W = LABEL_MM.width;
const H = LABEL_MM.height;
/** Ink stays this far off the edge, where thermal heads get unreliable. */
const PAD = 4;

const NAVY: [number, number, number] = [24, 42, 72];
const RED: [number, number, number] = [216, 30, 42];
const GREEN: [number, number, number] = [17, 116, 71];
const MUTED: [number, number, number] = [120, 120, 128];
const RULE: [number, number, number] = [60, 60, 66];

/**
 * jsPDF's built-in Helvetica is WinAnsi, so anything outside it draws as
 * garbage rather than as nothing — and cargo descriptions here routinely carry
 * Chinese, because that is what the Guangzhou desk typed.
 *
 * Unsupported glyphs are dropped rather than substituted. A Tanzanian clerk
 * reads the English half of "Massage gun, hair dryer (筋膜枪)" and a mojibake
 * tail would only make the card look broken. Embedding a CJK face would add
 * megabytes to every label for a line nobody at this end reads.
 */
function winAnsi(value: string) {
  return value
    .replace(/[→⟶]/g, "-")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[·•]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** A small uppercase field name, the same one the on-screen card uses. */
function fieldLabel(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text(winAnsi(text.toUpperCase()), x, y, { charSpace: 0.25 });
}

/**
 * The brand block, top-left on both cards.
 *
 * The logo asset is the full registered lockup — the globe AND the words
 * "Target / Express Air Cargo". Setting "TARGET EXPRESS" beside it printed the
 * company name twice on a card 100mm wide, which is the sort of thing that
 * makes a document look assembled rather than designed. The artwork says it.
 */
function brand(doc: jsPDF, y: number) {
  const logoH = 10;
  const logoW = logoH * BRAND_LOGO_RATIO;
  doc.addImage(BRAND_LOGO_PNG, "PNG", PAD, y, logoW, logoH);
  return y + logoH;
}

/**
 * Text clipped to a width, with an ellipsis rather than a silent cut.
 *
 * A card has a fixed physical width; a customer name does not. Truncating
 * without a mark is how "Neema Traders Ltd" becomes "Neema Traders" and looks
 * deliberate.
 */
function clipped(doc: jsPDF, text: string, maxWidth: number) {
  const clean = winAnsi(text);
  if (doc.getTextWidth(clean) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trim()}...`;
}

export type LabelPdfInput = {
  trackingNumber: string;
  packageRef: string;
  customerName: string;
  description: string;
  weightLabel: string;
  packagesLabel: string;
  registeredOn: string;
  sequence: number;
  packages: number;
  /** The QR as a PNG data URL, already rendered. */
  qr: string;
};

/**
 * One page per package. Five cartons is a five-page file, each with its own
 * code — never one label copied onto five boxes, which is what makes a missing
 * carton invisible until the customer is at the counter.
 */
export function renderLabelPdf(labels: LabelPdfInput[]): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: [W, H], compress: true });

  labels.forEach((label, index) => {
    if (index > 0) doc.addPage([W, H]);
    drawLabel(doc, label);
  });

  return doc.output("arraybuffer");
}

function drawLabel(doc: jsPDF, data: LabelPdfInput) {
  const bottom = brand(doc, PAD);

  // "1 / 3", read from across a loading bay.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  const seq = String(data.sequence);
  const of = ` / ${data.packages}`;
  doc.setFontSize(12);
  const ofW = doc.getTextWidth(of);
  doc.setFontSize(20);
  const seqW = doc.getTextWidth(seq);
  doc.text(seq, W - PAD - ofW - seqW, bottom - 1.5);
  doc.setFontSize(12);
  doc.text(of, W - PAD - ofW, bottom - 1.5);

  let y = bottom + 2.2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(PAD, y, W - PAD, y);

  y += 5;
  fieldLabel(doc, "Tracking number", PAD, y);
  y += 7.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(23);
  doc.setTextColor(0, 0, 0);
  doc.text(data.trackingNumber, PAD, y);

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(data.packageRef, PAD, y);

  y += 5.5;
  fieldLabel(doc, "Consignee", PAD, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(clipped(doc, data.customerName, W - PAD * 2), PAD, y);

  // Pinned to the bottom, so a one-line description and a two-line one produce
  // the same object, with the contents sitting directly above the strip rather
  // than stranded under the code.
  const stripY = H - PAD - 8;
  const desc = doc.splitTextToSize(winAnsi(data.description), W - PAD * 2) as string[];
  const lines = desc.slice(0, 2);
  const descTop = stripY - 3 - lines.length * 3.6;

  /*
    The code, centred in the space between the consignee and the contents.

    Top-aligning it left a band of blank card underneath that read as an
    unfinished label rather than as breathing room, and the band changed size
    with the length of the description — so no two labels looked alike.
  */
  const qrSize = 58;
  const regionTop = y + 3;
  const regionBottom = descTop - 6.2;
  const qrY = Math.max(regionTop, regionTop + (regionBottom - regionTop - qrSize) / 2);
  doc.addImage(data.qr, "PNG", (W - qrSize) / 2, qrY, qrSize, qrSize);

  fieldLabel(doc, "Contents", PAD, descTop - 3.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(lines, PAD, descTop + 0.6);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(PAD, stripY, W - PAD, stripY);

  const cols = [
    { label: "Weight", value: data.weightLabel },
    { label: "Quantity", value: data.packagesLabel },
    { label: "Registered", value: data.registeredOn },
  ];
  const colW = (W - PAD * 2) / 3;
  cols.forEach((col, i) => {
    const x = PAD + colW * i;
    fieldLabel(doc, col.label, x, stripY + 3);
    doc.setFont("courier", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(clipped(doc, col.value, colW - 2), x, stripY + 7.4);
  });
}

export type SlipPdfInput = {
  noteNumber: string;
  status: string;
  issuedOn: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  weightLabel: string;
  packagesLabel: string;
  invoiceNumber: string | null;
  paymentStatus: string;
  /**
   * Set when the cargo is going out on credit.
   *
   * This block was green and unconditional, so the copy the customer receives on
   * WhatsApp — the one they actually keep — stamped PAID IN FULL on a bill they
   * still owe. The screen version was fixed and this was not, which made the
   * more widely seen of the two documents the one that lied.
   */
  credit?: { dueOn: string | null; overdue: boolean } | null;
  amountLabel: string | null;
  officeLines: string[];
  qr: string;
};

/** The slip a customer carries to the warehouse, on the same card. */
export function renderPickupSlipPdf(data: SlipPdfInput): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: [W, H], compress: true });

  // The brand rule, in the proportion the registered mark uses its inks.
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 1.6, "F");
  doc.setFillColor(...RED);
  doc.rect(0, 0, 26, 1.6, "F");

  const bottom = brand(doc, PAD + 1.6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text("ISSUED", W - PAD, PAD + 4, { align: "right", charSpace: 0.25 });
  doc.setFont("courier", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(winAnsi(data.issuedOn), W - PAD, PAD + 8.4, { align: "right" });

  if (data.status !== "ACTIVE") {
    // A spent note has to be unmistakable in a queue.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...(data.status === "USED" ? GREEN : RED));
    doc.text(
      data.status === "USED" ? "COLLECTED" : "CANCELLED",
      W - PAD,
      PAD + 12.6,
      { align: "right" }
    );
  }

  let y = Math.max(bottom, PAD + 13) + 2.2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(PAD, y, W - PAD, y);

  const qrSize = 43;
  y += 3;
  doc.addImage(data.qr, "PNG", (W - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 6;

  // The two numbers a person is asked for at the counter.
  fieldLabel(doc, "Tracking number", PAD, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text("PICKUP CODE", W - PAD, y, { align: "right", charSpace: 0.25 });

  y += 5.6;
  doc.setFont("courier", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text(data.trackingNumber, PAD, y);
  doc.setFontSize(10);
  doc.text(data.noteNumber, W - PAD, y, { align: "right" });

  y += 5.4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  const phone = winAnsi(data.customerPhone ?? "No phone");
  doc.setFont("courier", "normal");
  const phoneW = doc.getTextWidth(phone);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clipped(doc, data.customerName, W - PAD * 2 - phoneW - 3), PAD, y);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(phone, W - PAD, y, { align: "right" });

  y += 5;
  fieldLabel(doc, "Cargo", PAD, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  const cargo = doc.splitTextToSize(winAnsi(data.description), W - PAD * 2) as string[];
  doc.text(cargo.slice(0, 2), PAD, y);
  y += cargo.length > 1 ? 7 : 3.4;

  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.3);
  doc.line(PAD, y, W - PAD, y);

  const facts = [
    { label: "Weight", value: data.weightLabel },
    { label: "Quantity", value: data.packagesLabel },
    { label: "Invoice", value: data.invoiceNumber ?? "-" },
  ];
  const factW = (W - PAD * 2) / 3;
  facts.forEach((fact, i) => {
    const x = PAD + factW * i;
    fieldLabel(doc, fact.label, x, y + 3.4);
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(clipped(doc, fact.value, factW - 2), x, y + 7.6);
  });
  y += 9.6;
  doc.line(PAD, y, W - PAD, y);

  // Paid or not — the question the counter asks before anything moves, and the
  // one thing a customer must never be able to misread off this card.
  y += 2;
  const onCredit = Boolean(data.credit);
  /* A pale red ground for a bill still owed, the same pale green for one that is
     settled — legible on the monochrome printer the warehouse actually uses,
     because the words carry it and the colour only reinforces them. */
  const band: [number, number, number] = onCredit
    ? [253, 232, 234]
    : [228, 242, 235];
  doc.setFillColor(...band);
  doc.rect(PAD, y, W - PAD * 2, onCredit ? 11.5 : 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...(onCredit ? RED : GREEN));
  doc.text(winAnsi(data.paymentStatus.toUpperCase()), PAD + 2.4, y + 5.4);
  if (data.amountLabel) {
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.text(winAnsi(data.amountLabel), W - PAD - 2.4, y + 5.4, { align: "right" });
  }
  if (data.credit) {
    /* The date, never a countdown: "due in 12 days" is wrong by tomorrow on a
       card somebody folds into a pocket. */
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...RED);
    doc.text(
      winAnsi(
        data.credit.overdue
          ? `OVERDUE${data.credit.dueOn ? ` — was due ${data.credit.dueOn}` : ""}`
          : data.credit.dueOn
            ? `Payment due ${data.credit.dueOn}`
            : "Payment pending"
      ),
      PAD + 2.4,
      y + 9.6
    );
  }
  y += onCredit ? 15.5 : 12;

  fieldLabel(doc, "Collect from", PAD, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  data.officeLines.forEach((line) => {
    doc.text(winAnsi(line), PAD, y);
    y += 3.4;
  });

  // The footer sits on the bottom edge whatever the address did above it.
  const footTop = H - PAD - 10;
  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.3);
  doc.line(PAD, footTop, W - PAD, footTop);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Valid once. Anyone collecting for you brings their own ID.",
    PAD,
    footTop + 3.4
  );
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 66);
  doc.text(`${COMPANY.phone} - ${COMPANY.phoneAlt}`, PAD, footTop + 6.8);
  doc.text(COMPANY.email, PAD, footTop + 9.6);

  return doc.output("arraybuffer");
}

/**
 * What the file is called once it lands on somebody's phone.
 *
 * The same rule the invoice download uses: one name and the tracking number.
 * A person forwarding this is looking at a list of attachments and needs to
 * know which customer and which cargo without opening any of them, and a
 * business name like "Neema Traders Ltd" is truncated by every chat client at
 * exactly the point where the tracking number would have been.
 */
export function cardFileName(
  customerName: string,
  trackingNumber: string,
  kind: string
) {
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}\p{N}]/gu, "");
  const name = clean.length > 0 ? clean : "Customer";
  const full = `${name} ${trackingNumber} ${kind}.pdf`;

  return {
    full,
    // Plain ASCII fallback. A Swahili or Chinese name reduced to nothing here
    // still leaves the tracking number, which is the half that identifies it.
    ascii:
      full.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "").trim() ||
      `${trackingNumber} ${kind}.pdf`,
  };
}

/** The headers that make a browser save the file rather than open a tab. */
export function pdfHeaders(fileName: { full: string; ascii: string }) {
  return {
    "Content-Type": "application/pdf",
    // The quoted ASCII name must come first — some clients take the fallback
    // and stop reading.
    "Content-Disposition":
      `attachment; filename="${fileName.ascii}"; ` +
      `filename*=UTF-8''${encodeURIComponent(fileName.full)}`,
    "Cache-Control": "no-store",
  };
}
