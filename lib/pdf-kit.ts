import "server-only";

import { jsPDF } from "jspdf";

import { BRAND_LOGO_PNG, BRAND_LOGO_RATIO } from "@/lib/brand-logo-png";
import { COMPANY } from "@/lib/constants";

/**
 * The house style for every document this business hands over.
 *
 * The invoice has looked like a real document for a long time — brand rule,
 * logo, ghosted watermark, ruled tables, a footer that attributes every page.
 * The reports did not: they were a title, a grid of numbers and nothing else,
 * which is exactly what "it looks like someone just wrote on paper" means. The
 * difference was never the data. It was that the furniture lived inside
 * invoice-pdf.ts and nothing else could reach it.
 *
 * So it lives here. A report, a statement and an invoice now come off the same
 * press, and anything printed later inherits the same paper rather than
 * inventing a fifth look.
 */

export const PAGE_W_PORTRAIT = 595.28; // A4 at 72dpi
export const PAGE_H_PORTRAIT = 841.89;

export const NAVY: RGB = [24, 42, 72];
export const RED: RGB = [216, 30, 42];
export const INK: RGB = [18, 20, 26];
export const MUTED: RGB = [112, 118, 130];
export const HAIR: RGB = [214, 217, 224];
export const TINT: RGB = [246, 247, 250];
export const BAND: RGB = [238, 241, 246];
export const GREEN: RGB = [17, 116, 71];
export const AMBER: RGB = [168, 106, 8];
export const WHITE: RGB = [255, 255, 255];

export type RGB = [number, number, number];

/**
 * Fold text onto the character set the built-in fonts actually have.
 *
 * jsPDF's Helvetica is WinAnsi. Anything outside it does not fall back — it
 * renders as a stray quote mark with the rest of the line letter-spaced, which
 * is how "Guangzhou → Dar es Salaam" once reached a customer as garbage.
 */
export function winAnsi(value: string) {
  return String(value)
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -ÿ–—€]/g, "");
}

export type Column = {
  key: string;
  label: string;
  numeric?: boolean;
  /** Never shrink below this. Used for the column somebody scans down. */
  min?: number;
};

export type SheetOptions = {
  /** "REPORT", "FINANCIAL STATEMENT" — the eyebrow above the title. */
  kind: string;
  title: string;
  /** The period, printed under the title where it cannot be missed. */
  subtitle?: string;
  /** One or two sentences: what this is and what it leaves out. */
  caption?: string;
  /** Printed at the foot of every page beside the page number. */
  reference?: string;
  landscape?: boolean;
  /** Small key/value chips under the header — period, rate, filters. */
  facts?: { label: string; value: string }[];
};

export function createSheet(options: SheetOptions) {
  const landscape = options.landscape ?? false;
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: landscape ? "landscape" : "portrait",
    compress: true,
  });

  const PAGE_W = landscape ? PAGE_H_PORTRAIT : PAGE_W_PORTRAIT;
  const PAGE_H = landscape ? PAGE_W_PORTRAIT : PAGE_H_PORTRAIT;
  const MARGIN = 44;
  const RIGHT = PAGE_W - MARGIN;
  const CONTENT = RIGHT - MARGIN;
  const FOOT_TOP = PAGE_H - 58;

  let page = 1;
  let y = 0;

  const setInk = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);

  function put(
    value: string,
    x: number,
    yy: number,
    {
      size = 9.5,
      style = "normal" as "normal" | "bold" | "italic",
      align = "left" as "left" | "right" | "center",
      colour = INK,
    } = {}
  ) {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    setInk(colour);
    doc.text(winAnsi(value), x, yy, { align });
  }

  /** A small uppercase field name. Every block on the page is titled this way. */
  function label(value: string, x: number, yy: number, colour: RGB = MUTED) {
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "bold");
    setInk(colour);
    doc.text(winAnsi(value.toUpperCase()), x, yy, { charSpace: 0.9 });
  }

  function rule(yy: number, from = MARGIN, to = RIGHT, colour: RGB = HAIR, width = 0.6) {
    doc.setDrawColor(colour[0], colour[1], colour[2]);
    doc.setLineWidth(width);
    doc.line(from, yy, to, yy);
  }

  /**
   * Chrome belonging to the sheet rather than the content, redrawn on every
   * page — a second page carrying no mark is a second page nobody can
   * attribute, and these get photographed and forwarded one page at a time.
   */
  function furniture(n: number) {
    setFill(NAVY);
    doc.rect(0, 0, PAGE_W, 6, "F");
    setFill(RED);
    doc.rect(0, 0, 148, 6, "F");

    const wmW = Math.min(320, CONTENT * 0.6);
    doc.saveGraphicsState();
    // @ts-expect-error -- GState is attached to the jsPDF instance at runtime.
    doc.setGState(new doc.GState({ opacity: 0.04 }));
    doc.addImage(
      BRAND_LOGO_PNG,
      "PNG",
      (PAGE_W - wmW) / 2,
      PAGE_H / 2 - wmW / BRAND_LOGO_RATIO / 2,
      wmW,
      wmW / BRAND_LOGO_RATIO
    );
    doc.restoreGraphicsState();

    rule(FOOT_TOP + 16);
    put(COMPANY.name, MARGIN, FOOT_TOP + 29, { size: 8, style: "bold", colour: NAVY });
    put("KWETU MUDA NI MALI", MARGIN, FOOT_TOP + 39, {
      size: 6.8,
      style: "bold",
      colour: RED,
    });
    put(`${COMPANY.phone}  ·  ${COMPANY.email}`, RIGHT, FOOT_TOP + 29, {
      size: 7.5,
      align: "right",
      colour: MUTED,
    });
    put(
      `${options.reference ? `${options.reference}  ·  ` : ""}page ${n}`,
      RIGHT,
      FOOT_TOP + 39,
      { size: 7.5, align: "right", colour: MUTED }
    );
  }

  function newPage() {
    doc.addPage();
    page += 1;
    furniture(page);
    y = MARGIN + 16;
    put(`${options.title} — continued`, MARGIN, y, {
      size: 8,
      style: "bold",
      colour: MUTED,
    });
    y += 20;
  }

  /** Reserve vertical space, breaking the page rather than running off it. */
  function need(height: number) {
    if (y + height > FOOT_TOP) newPage();
  }

  // ─────────────────────────────────────────────────────────────── heading ──
  function heading() {
    furniture(page);

    const logoW = 138;
    doc.addImage(BRAND_LOGO_PNG, "PNG", MARGIN, 26, logoW, logoW / BRAND_LOGO_RATIO);

    put(options.kind.toUpperCase(), RIGHT, 46, {
      size: 8,
      style: "bold",
      align: "right",
      colour: RED,
    });
    put(options.title, RIGHT, 66, {
      size: 17,
      style: "bold",
      align: "right",
      colour: NAVY,
    });
    if (options.subtitle) {
      put(options.subtitle, RIGHT, 81, { size: 9, align: "right", colour: MUTED });
    }

    y = 98;
    rule(y, MARGIN, RIGHT, NAVY, 1.4);
    y += 18;

    if (options.caption) {
      const lines = doc.splitTextToSize(winAnsi(options.caption), CONTENT);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setInk(MUTED);
      doc.text(lines, MARGIN, y);
      y += lines.length * 10 + 8;
    }

    if (options.facts?.length) {
      /* The reading conditions — period, rate, filters — as a strip rather
         than a sentence, because they are looked up, not read. */
      const h = 38;
      const cols = options.facts.length;
      setFill(TINT);
      doc.roundedRect(MARGIN, y, CONTENT, h, 4, 4, "F");
      options.facts.forEach((fact, i) => {
        const x = MARGIN + 14 + (CONTENT / cols) * i;
        label(fact.label, x, y + 14);
        put(fact.value, x, y + 28, { size: 9, style: "bold" });
      });
      y += h + 16;
    }
  }

  // ───────────────────────────────────────────────────────────────── table ──
  /**
   * A table that reads like a ledger: a navy header band, zebra rows so the eye
   * does not slip a line, figures right-aligned on their digits, negatives in
   * red, and a ruled total.
   *
   * Column widths come from the content — every header and cell is measured,
   * and the columns are scaled to the page in proportion. A fixed grid gave
   * "Customer" the same room as "Kg" and truncated the one column anybody
   * actually reads.
   */
  function table(input: {
    columns: Column[];
    rows: (string | number | null | undefined)[][];
    totals?: (string | number | null | undefined)[];
    /** Extra note printed under the table, e.g. the shilling conversion. */
    note?: string;
  }) {
    const { columns, rows } = input;
    const pad = 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const headWidths = columns.map((c) => doc.getTextWidth(winAnsi(c.label.toUpperCase())));

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const bodyWidths = columns.map((_, i) => {
      let widest = 0;
      /* 400 rows is plenty to find the widest cell and keeps a 5,000-row
         ledger from spending its time measuring text. */
      for (const row of rows.slice(0, 400)) {
        const w = doc.getTextWidth(winAnsi(cell(row[i])));
        if (w > widest) widest = w;
      }
      return widest;
    });

    const natural = columns.map((c, i) =>
      Math.max(headWidths[i], bodyWidths[i], c.min ?? 0) + pad * 2
    );
    const totalNatural = natural.reduce((a, b) => a + b, 0);
    const scale = CONTENT / totalNatural;
    /*
      Always the full width of the page.

      Too wide, and every column scales down together so the proportions hold.
      Too narrow, and the surplus goes to the text columns — the description,
      the customer, the line item — because a figure column only ever needs
      room for its digits. A five-line profit and loss huddled against the left
      margin under half a page of white space reads as a fragment of a report
      rather than the whole of a small one.
    */
    const widths = (() => {
      if (scale < 1) return natural.map((w) => w * scale);
      const surplus = CONTENT - totalNatural;
      const growable = columns
        .map((c, i) => (c.numeric ? -1 : i))
        .filter((i) => i >= 0);
      const targets = growable.length > 0 ? growable : columns.map((_, i) => i);
      const targetTotal = targets.reduce((a, i) => a + natural[i], 0);
      return natural.map((w, i) =>
        targets.includes(i) ? w + surplus * (w / targetTotal) : w
      );
    })();
    const tableW = widths.reduce((a, b) => a + b, 0);
    const xs: number[] = [];
    let cursor = MARGIN;
    for (const w of widths) {
      xs.push(cursor);
      cursor += w;
    }

    const align = (i: number) =>
      columns[i].numeric ? xs[i] + widths[i] - pad : xs[i] + pad;

    function head() {
      need(46);
      setFill(NAVY);
      doc.rect(MARGIN, y, tableW, 19, "F");
      columns.forEach((c, i) => {
        put(c.label.toUpperCase(), align(i), y + 12.5, {
          size: 7,
          style: "bold",
          align: c.numeric ? "right" : "left",
          colour: WHITE,
        });
      });
      y += 19;
    }

    function cell(value: string | number | null | undefined) {
      if (value === null || value === undefined || value === "") return "—";
      if (typeof value === "number") {
        return value.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
          maximumFractionDigits: 2,
        });
      }
      return String(value);
    }

    head();

    rows.forEach((row, index) => {
      if (y + 18 > FOOT_TOP) {
        newPage();
        head();
      }
      if (index % 2 === 1) {
        setFill(TINT);
        doc.rect(MARGIN, y, tableW, 17, "F");
      }
      columns.forEach((c, i) => {
        const raw = row[i];
        const text = cell(raw);
        const negative =
          (typeof raw === "number" && raw < 0) ||
          (typeof raw === "string" && /^-|^\(.*\)$|-[\d,]/.test(raw.trim()) && c.numeric);

        /* Shrink to fit, never drop: a figure wider than its column used to
           print as its first few characters, which is a silent lie. */
        let size = 8.2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        let shown = winAnsi(text);
        while (doc.getTextWidth(shown) > widths[i] - pad * 2 && size > 6) {
          size -= 0.3;
          doc.setFontSize(size);
        }
        while (shown.length > 1 && doc.getTextWidth(shown) > widths[i] - pad * 2) {
          shown = `${shown.slice(0, -2)}…`;
        }
        put(shown, align(i), y + 11.5, {
          size,
          align: c.numeric ? "right" : "left",
          colour: negative ? RED : INK,
        });
      });
      y += 17;
      rule(y, MARGIN, MARGIN + tableW, HAIR, 0.4);
    });

    if (input.totals) {
      need(30);
      setFill(BAND);
      doc.rect(MARGIN, y, tableW, 21, "F");
      columns.forEach((c, i) => {
        const raw = input.totals?.[i];
        if (raw === null || raw === undefined || raw === "") return;
        const negative = typeof raw === "number" && raw < 0;
        put(cell(raw), align(i), y + 14, {
          size: 8.8,
          style: "bold",
          align: c.numeric ? "right" : "left",
          colour: negative ? RED : NAVY,
        });
      });
      y += 21;
      rule(y, MARGIN, MARGIN + tableW, NAVY, 1);
    }

    y += 12;

    if (input.note) {
      const lines = doc.splitTextToSize(winAnsi(input.note), CONTENT);
      need(lines.length * 10 + 6);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      setInk(MUTED);
      doc.text(lines, MARGIN, y);
      y += lines.length * 10 + 6;
    }
  }

  /** "Prepared by … / Printed …", then two lines to sign on. */
  function signature(preparedBy: string) {
    need(78);
    y += 10;
    rule(y);
    y += 16;
    put(`Prepared by ${preparedBy}`, MARGIN, y, { size: 8, colour: MUTED });
    put(
      `Printed ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      RIGHT,
      y,
      { size: 8, align: "right", colour: MUTED }
    );
    y += 30;
    rule(y, MARGIN, MARGIN + 170, HAIR, 0.8);
    rule(y, RIGHT - 170, RIGHT, HAIR, 0.8);
    y += 11;
    label("Finance", MARGIN, y);
    label("Approved by", RIGHT - 170, y);
  }

  return {
    doc,
    heading,
    table,
    signature,
    put,
    label,
    rule,
    need,
    newPage,
    setFill,
    setInk,
    geometry: { PAGE_W, PAGE_H, MARGIN, RIGHT, CONTENT, FOOT_TOP },
    get y() {
      return y;
    },
    set y(value: number) {
      y = value;
    },
    finish: () => Buffer.from(doc.output("arraybuffer")),
  };
}

export type Sheet = ReturnType<typeof createSheet>;
