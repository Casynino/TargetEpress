import "server-only";

import { MUTED, createSheet } from "@/lib/pdf-kit";

/**
 * The manifest as a file, not a print dialog.
 *
 * A printed manifest is carried onto the floor and ticked with a pen, which is
 * what the Print button is for. A saved one is a different job: it is emailed
 * to the clearing agent, kept against a customs query months later, and — the
 * reason the owner asked — forwarded on WhatsApp by whoever is not standing
 * next to a printer. Guangzhou's phone could produce a label as a file and a
 * manifest only as a dialog.
 *
 * Off the same press as the report and the invoice: brand rule, navy banded
 * table, zebra rows, a ruled total and an attributed footer. Landscape, because
 * eleven columns in portrait is a list of abbreviations rather than a table.
 *
 * ENGLISH, whatever the reader's language. The manifest is checked in Dar and
 * filed with a Tanzanian clearing agent, and the PDF fonts are WinAnsi — a
 * Chinese cargo type would be dropped from the page rather than drawn, leaving
 * an empty cell where the goods should be. The caller resolves every field
 * against the English side first; see the route.
 */

export type ManifestPdfRow = {
  received: string;
  tracking: string;
  customer: string;
  phone: string;
  item: string;
  countedAs: string;
  weight: string;
  receivedBy: string;
  problem: string;
};

export type ManifestPdfInput = {
  batchNumber: string;
  /** "Hong Kong - Dar es Salaam - Electronics & special goods". */
  route: string;
  waybill: string;
  departed: string;
  arrived: string;
  consignments: number;
  totalPackages: string;
  totalWeight: string;
  totalArrived: string;
  rows: ManifestPdfRow[];
};

/**
 * What is left of a label once the PDF's fonts have had it — or the fallback.
 *
 * The built-in fonts are WinAnsi and simply drop what they cannot draw, so a
 * cargo type the Guangzhou desk typed in Chinese arrives here as an empty
 * string and prints as an empty cell. On a label that is survivable, because
 * the sticker carries a tracking number too; on a manifest the goods column IS
 * the document, and a customs officer holding a sheet with a blank against a
 * 479 kg line has been given nothing.
 *
 * Bracketed Chinese leaves its brackets behind as well — "Documents (单证)"
 * becomes "Documents ()" — so those are closed up here rather than printed as
 * punctuation around a hole.
 */
export function latinLabel(text: string, fallback: string): string {
  const kept = String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-\u2014\u2013]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return kept.length > 0 ? kept : fallback;
}

/**
 * An empty box, in characters the built-in fonts actually have.
 *
 * The screen draws a real square with a border. A PDF drawn with WinAnsi
 * Helvetica has no ballot box in it, and the glyph would be dropped silently —
 * leaving a manifest with nothing to tick, which is the one thing this document
 * exists for.
 */
const TICK_BOX = "[    ]";

export function manifestToPdf(input: ManifestPdfInput) {
  const sheet = createSheet({
    kind: "Batch manifest",
    title: input.batchNumber,
    subtitle: input.route,
    caption:
      "Every consignment on this flight, in the order it was registered. " +
      "Check the cargo against it line by line and tick each box as the boxes " +
      "are counted off.",
    reference: `${input.batchNumber} manifest`,
    landscape: true,
    facts: [
      { label: "Waybill", value: input.waybill },
      { label: "Departed", value: input.departed },
      { label: "Arrived", value: input.arrived },
      { label: "Consignments", value: String(input.consignments) },
      { label: "Packages", value: input.totalPackages },
      { label: "Weight", value: input.totalWeight },
    ],
  });

  sheet.heading();

  if (input.rows.length === 0) {
    /* A flight with nothing on it says so in words. A header band with no rows
       under it reads as a document that failed to render. */
    sheet.put(
      "This batch has no cargo on it.",
      sheet.geometry.MARGIN,
      sheet.y + 8,
      { size: 10, style: "bold" }
    );
    sheet.y += 26;
    sheet.put(
      "Nothing has been registered against this batch, or everything on it has been removed.",
      sheet.geometry.MARGIN,
      sheet.y,
      { size: 8.5, colour: MUTED }
    );
    sheet.y += 24;
  } else {
    sheet.table({
      columns: [
        { key: "n", label: "#", numeric: true, min: 22 },
        { key: "received", label: "Received", min: 52 },
        /* The column somebody scans down with a carton in their hand. It is
           never squeezed to make room for figures. */
        { key: "tracking", label: "Tracking", min: 72 },
        { key: "customer", label: "Customer", min: 76 },
        { key: "phone", label: "Phone", min: 74 },
        { key: "item", label: "Which item?", min: 96 },
        { key: "countedAs", label: "Counted as", numeric: true, min: 54 },
        { key: "weight", label: "Weight", numeric: true, min: 44 },
        { key: "receivedBy", label: "Received by", min: 56 },
        { key: "problem", label: "Problem", min: 56 },
        { key: "checked", label: "Checked", min: 40 },
      ],
      rows: input.rows.map((row, index) => [
        String(index + 1),
        row.received,
        row.tracking,
        row.customer,
        row.phone,
        row.item,
        row.countedAs,
        row.weight,
        row.receivedBy,
        row.problem,
        TICK_BOX,
      ]),
      totals: [
        "Total",
        null,
        null,
        null,
        null,
        null,
        input.totalArrived,
        input.totalWeight,
        null,
        null,
        null,
      ],
      note:
        "Counted as shows what has actually been checked in against what was " +
        "declared, so a short consignment reads as short here rather than only " +
        "on a screen.",
    });
  }

  /* The manifest is signed by whoever checked it, not by whoever printed it —
     the signature block is the point of the document once it is on the floor. */
  sheet.signature("Checked by (name & signature)");
  return sheet.finish();
}

/** `HK-0001 manifest.pdf`, with an ASCII fallback for clients that need one. */
export function manifestFileName(batchNumber: string) {
  const full = `${batchNumber} manifest.pdf`;
  return {
    full,
    ascii:
      full.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "").trim() ||
      "manifest.pdf",
  };
}
