import "server-only";

import { ORIGIN_LABELS } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import type { FinanceDashboard } from "@/lib/finance-dashboard";
import {
  AMBER,
  BAND,
  GREEN,
  HAIR,
  INK,
  MUTED,
  NAVY,
  RED,
  type RGB,
  TINT,
  WHITE,
  createSheet,
} from "@/lib/pdf-kit";
import type { ReportUnit } from "@/lib/reports";

/**
 * The whole set of books for one period, as a document somebody can hand over.
 *
 * A single report table is a page from the books, not the books. What the
 * boss, a bank or an auditor asks for is one document that answers every
 * question in order: what came in, what it cost, what is left, who owes us,
 * where the money sits, and which batches earned it.
 *
 * ONE CURRENCY. It used to print shillings and dollars side by side, and the
 * owner's instruction was to stop: "if I'm on USD I should get a USD report,
 * if I'm on TSh I should get a TSh report — not two." The switch on the profit
 * screen decides, the document states which money it is written in and at what
 * rate, and every figure inside it agrees.
 *
 * Colour carries meaning here and nowhere else: money in is green, money out
 * is red, the headline panel turns red when the period lost money, and the
 * share bars are the only decoration on the page. Everything else is navy on
 * white, because a financial statement earns trust by being legible.
 */

type Pl = FinanceDashboard["pl"];

export function statementToPdf(input: {
  dash: FinanceDashboard;
  pl: Pl;
  prior: Pl;
  /** USD → TZS in force when this was printed. Null when none is published. */
  rate: number | null;
  /** Which money the reader is working in. */
  unit: ReportUnit;
  /** "August 2026", "2026". */
  periodLabel: string;
  /** The dates themselves, so the period can never be misread. */
  periodDates: string;
  previousLabel: string;
  producedBy: string;
}) {
  const { dash, pl, prior, rate, periodLabel, periodDates, previousLabel } = input;

  const inShillings = input.unit === "TZS" && rate !== null;
  const unitLabel = inShillings ? "TSh" : "USD";

  /** Every figure on the page, in the one currency this document is written in. */
  const fmt = (usd: number) =>
    inShillings
      ? `TSh ${Math.round(usd * (rate as number)).toLocaleString("en-US")}`
      : `USD ${usd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  const sheet = createSheet({
    kind: "Financial statement",
    title: periodLabel,
    subtitle: periodDates,
    reference: `Statement · ${periodLabel}`,
    facts: [
      { label: "Period", value: periodDates },
      { label: "Money in", value: inShillings ? "Shillings (TSh)" : "Dollars (USD)" },
      {
        label: inShillings ? "At the rate" : "Rate on file",
        value: rate === null ? "none published" : `USD 1 = TSh ${rate.toLocaleString("en-US")}`,
      },
      { label: "Prepared by", value: input.producedBy },
    ],
  });

  const { doc, put, label, rule, need, setFill, geometry } = sheet;
  const { MARGIN, RIGHT, CONTENT } = geometry;

  /* ───────────────────────────────────────────────────────────── primitives */

  /** A numbered section header: a navy bar the eye can find when flicking. */
  const section = (n: number, title: string, note?: string) => {
    need(note ? 76 : 54);
    sheet.y += 14;
    setFill(NAVY);
    doc.rect(MARGIN, sheet.y, CONTENT, 20, "F");
    setFill(RED);
    doc.rect(MARGIN, sheet.y, 3.5, 20, "F");
    put(`${n}.  ${title.toUpperCase()}`, MARGIN + 14, sheet.y + 13.5, {
      size: 8.5,
      style: "bold",
      colour: WHITE,
    });
    sheet.y += 20 + 12;
    if (note) {
      const lines = doc.splitTextToSize(note, CONTENT);
      doc.setFontSize(7.8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(lines, MARGIN, sheet.y);
      sheet.y += lines.length * 9.5 + 8;
    }
  };

  /** The coloured cards at the top: the four figures anybody asks for first. */
  const cards = (
    items: { k: string; v: string; note?: string; fill: RGB }[]
  ) => {
    need(76);
    const gap = 9;
    const w = (CONTENT - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const x = MARGIN + (w + gap) * i;
      setFill(item.fill);
      doc.roundedRect(x, sheet.y, w, 62, 4, 4, "F");
      put(item.k.toUpperCase(), x + 12, sheet.y + 17, {
        size: 6.6,
        style: "bold",
        colour: WHITE,
      });
      /* The figure shrinks to fit its card rather than running off it: a
         shilling figure in the tens of millions is a lot of digits. */
      let size = 14;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      while (doc.getTextWidth(item.v) > w - 24 && size > 8) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      put(item.v, x + 12, sheet.y + 38, { size, style: "bold", colour: WHITE });
      if (item.note) {
        put(item.note, x + 12, sheet.y + 52, { size: 6.8, colour: [235, 238, 244] });
      }
    });
    sheet.y += 62 + 14;
  };

  /** One line of the statement: what it is, and what it came to. */
  const line = (
    text: string,
    amountUsd: number | null,
    opts: {
      strong?: boolean;
      indent?: number;
      note?: string;
      plain?: string;
      colour?: RGB;
    } = {}
  ) => {
    need(20);
    put(text, MARGIN + (opts.indent ?? 0), sheet.y, {
      size: opts.strong ? 9.5 : 9,
      style: opts.strong ? "bold" : "normal",
      colour: opts.strong ? INK : [58, 62, 70],
    });
    const value = opts.plain ?? (amountUsd === null ? "" : fmt(amountUsd));
    if (value) {
      put(value, RIGHT, sheet.y, {
        size: opts.strong ? 9.5 : 9,
        style: opts.strong ? "bold" : "normal",
        align: "right",
        colour: opts.colour ?? (opts.strong ? NAVY : INK),
      });
    }
    if (opts.note) {
      put(opts.note, MARGIN + (opts.indent ?? 0) + 2, sheet.y + 8.5, {
        size: 7,
        colour: MUTED,
      });
      sheet.y += 8.5;
    }
    sheet.y += 15;
  };

  /** A ruled total — the line a reader's eye stops on. */
  const total = (text: string, amountUsd: number, tone: RGB = NAVY) => {
    need(34);
    sheet.y += 3;
    rule(sheet.y, MARGIN, RIGHT, HAIR, 0.6);
    sheet.y += 6;
    setFill(BAND);
    doc.rect(MARGIN, sheet.y, CONTENT, 21, "F");
    put(text, MARGIN + 10, sheet.y + 14, { size: 9.5, style: "bold", colour: NAVY });
    put(fmt(amountUsd), RIGHT - 10, sheet.y + 14, {
      size: 10.5,
      style: "bold",
      align: "right",
      colour: tone,
    });
    sheet.y += 21 + 12;
  };

  /**
   * A share, as a bar.
   *
   * The only decoration on the page, and it still carries a number. Drawn
   * against the line it belongs to rather than on its own row — a full-width
   * bar between two labels reads as belonging to the one underneath it, which
   * is exactly how the first draft mislabelled every cost in the breakdown.
   */
  const shareBar = (share: number, colour: RGB, width = 190, indent = 12) => {
    const h = 3;
    const top = sheet.y - 11;
    const x = MARGIN + indent;
    setFill(HAIR);
    doc.roundedRect(x, top, width, h, 1.5, 1.5, "F");
    const filled = Math.max(1.5, Math.min(100, share)) / 100;
    setFill(colour);
    doc.roundedRect(x, top, width * filled, h, 1.5, 1.5, "F");
    sheet.y += 5;
  };

  /** A wide progress bar on its own line, for a single headline percentage. */
  const rateBar = (share: number, colour: RGB) => {
    need(20);
    const h = 5;
    setFill(HAIR);
    doc.roundedRect(MARGIN, sheet.y, CONTENT, h, 2.5, 2.5, "F");
    const filled = Math.max(0, Math.min(100, share)) / 100;
    if (filled > 0) {
      setFill(colour);
      doc.roundedRect(MARGIN, sheet.y, Math.max(6, CONTENT * filled), h, 2.5, 2.5, "F");
    }
    sheet.y += h + 12;
  };

  /** A compact table for the tabular sections. */
  const grid = (
    columns: { label: string; width: number; numeric?: boolean }[],
    rows: string[][],
    tone: RGB = NAVY
  ) => {
    const xs: number[] = [];
    let cursor = MARGIN;
    for (const c of columns) {
      xs.push(cursor);
      cursor += c.width;
    }
    const tableW = columns.reduce((a, b) => a + b.width, 0);
    const at = (i: number) =>
      columns[i].numeric ? xs[i] + columns[i].width - 6 : xs[i] + 6;

    const head = () => {
      need(40);
      setFill(tone);
      doc.rect(MARGIN, sheet.y, tableW, 17, "F");
      columns.forEach((c, i) => {
        put(c.label.toUpperCase(), at(i), sheet.y + 11.5, {
          size: 6.6,
          style: "bold",
          align: c.numeric ? "right" : "left",
          colour: WHITE,
        });
      });
      sheet.y += 17;
    };

    head();
    rows.forEach((row, index) => {
      if (sheet.y + 16 > geometry.FOOT_TOP) {
        sheet.newPage();
        head();
      }
      if (index % 2 === 1) {
        setFill(TINT);
        doc.rect(MARGIN, sheet.y, tableW, 16, "F");
      }
      columns.forEach((c, i) => {
        let size = 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        let shown = row[i] ?? "";
        while (doc.getTextWidth(shown) > c.width - 12 && size > 6) {
          size -= 0.3;
          doc.setFontSize(size);
        }
        while (shown.length > 1 && doc.getTextWidth(shown) > c.width - 12) {
          shown = `${shown.slice(0, -2)}…`;
        }
        put(shown, at(i), sheet.y + 11, {
          size,
          align: c.numeric ? "right" : "left",
          colour: shown.trim().startsWith("-") && c.numeric ? RED : INK,
        });
      });
      sheet.y += 16;
      rule(sheet.y, MARGIN, MARGIN + tableW, HAIR, 0.35);
    });
    sheet.y += 10;
  };

  const move = (now: number, before: number) => {
    if (before === 0) return `no ${previousLabel} to compare`;
    const p = Math.round(((now - before) / Math.abs(before)) * 100);
    if (p === 0) return `same as ${previousLabel}`;
    return `${p > 0 ? "up" : "down"} ${Math.abs(p)}% on ${previousLabel}`;
  };

  /* ─────────────────────────────────────────────────────────────── the page */

  sheet.heading();

  const profitable = pl.profit >= 0;

  cards([
    {
      k: "Revenue billed",
      v: fmt(pl.revenue),
      note: move(pl.revenue, prior.revenue),
      fill: NAVY,
    },
    {
      k: "Costs incurred",
      v: fmt(pl.costs),
      note: move(pl.costs, prior.costs),
      fill: RED,
    },
    {
      k: profitable ? "Net profit" : "Net loss",
      v: fmt(Math.abs(pl.profit)),
      note: pl.margin === null ? "no margin yet" : `${pl.margin.toFixed(1)}% margin`,
      fill: profitable ? GREEN : RED,
    },
    {
      k: "Collected",
      v: fmt(pl.cashIn),
      note: move(pl.cashIn, prior.cashIn),
      fill: GREEN,
    },
  ]);

  /* The sentence under the cards. Somebody reading only the first inch of this
     document should still leave with the right answer — so it wraps to the
     panel rather than running off the edge of it. */
  const verdict = `${fmt(pl.revenue)} billed on ${pl.invoices} confirmed ${
    pl.invoices === 1 ? "invoice" : "invoices"
  }, less ${fmt(pl.costs)} of costs incurred. Counted from the day the work happened, not the day the money moved.`;
  doc.setFontSize(7.8);
  doc.setFont("helvetica", "normal");
  const verdictLines = doc.splitTextToSize(verdict, CONTENT - 28);
  const panelH = 30 + verdictLines.length * 10;
  need(panelH + 10);
  setFill(profitable ? [240, 248, 244] : [253, 242, 242]);
  doc.roundedRect(MARGIN, sheet.y, CONTENT, panelH, 4, 4, "F");
  setFill(profitable ? GREEN : RED);
  doc.rect(MARGIN, sheet.y, 3.5, panelH, "F");
  put(
    profitable
      ? `${periodLabel} made a profit of ${fmt(pl.profit)}.`
      : `${periodLabel} lost ${fmt(Math.abs(pl.profit))}.`,
    MARGIN + 14,
    sheet.y + 18,
    { size: 10.5, style: "bold", colour: profitable ? GREEN : RED }
  );
  doc.setFontSize(7.8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(verdictLines, MARGIN + 14, sheet.y + 32);
  sheet.y += panelH + 6;

  // ───────────────────────────────────────────────── 1. profit and loss ──
  section(
    1,
    "Profit & loss — did the work make money",
    "Accrual basis: bills raised and costs incurred inside the period, whether or not anybody has paid yet. This is the figure that says whether the business works."
  );
  line(`Freight billed on ${pl.invoices} confirmed invoices`, pl.revenue);
  sheet.y += 2;
  label("Less costs", MARGIN, sheet.y);
  sheet.y += 13;
  const biggestCost = pl.categories[0]?.amount ?? 0;
  for (const row of pl.categories) {
    line(EXPENSE_CATEGORY_LABELS[row.category] ?? row.category, row.amount, {
      indent: 12,
    });
    shareBar(biggestCost > 0 ? (row.amount / biggestCost) * 100 : 0, AMBER);
  }
  total("Total costs", pl.costs, RED);
  total(profitable ? "Net profit" : "Net loss", pl.profit, profitable ? GREEN : RED);
  if (pl.specialCosts > 0) {
    line("Non-operating payments, kept out of the margin", pl.specialCosts, {
      note: `${pl.specialCount} ${
        pl.specialCount === 1 ? "payment" : "payments"
      } — real money out, but not a cost of moving cargo`,
    });
    line("Profit after those payments", pl.profitAfterSpecial, { strong: true });
  }

  // ─────────────────────────────────────────────────────── 2. cash moved ──
  section(
    2,
    "Cash — did the money move",
    "What customers actually paid and what actually left an account inside the period. This is the figure that decides whether payroll can be met."
  );
  line("Collected from customers", pl.cashIn, { colour: GREEN });
  line("Paid out", pl.cashOut, { colour: RED });
  total("Net cash movement", pl.netCash, pl.netCash >= 0 ? GREEN : RED);

  // ─────────────────────────────────────────────── 3. where revenue came ──
  section(
    3,
    "Where the revenue comes from",
    "Freight billed in this period. Every invoice belongs to a consignment — there is no other kind of income in the system."
  );
  line("Expected", dash.revenue.expectedUsd);
  line("Collected", dash.revenue.collectedUsd, { colour: GREEN });
  line("Still outstanding", dash.revenue.outstandingUsd, {
    colour: dash.revenue.outstandingUsd > 0 ? RED : INK,
    note:
      dash.revenue.collectionRate === null
        ? undefined
        : `${dash.revenue.collectionRate}% of what was billed has come in`,
  });
  if (dash.revenue.collectionRate !== null) {
    rateBar(dash.revenue.collectionRate, GREEN);
  }
  if (dash.revenue.byOrigin.length > 0) {
    grid(
      [
        { label: "Origin", width: 180 },
        { label: `Billed (${unitLabel})`, width: 164, numeric: true },
        { label: `Collected (${unitLabel})`, width: 163, numeric: true },
      ],
      dash.revenue.byOrigin.map((r) => [
        ORIGIN_LABELS[r.origin as keyof typeof ORIGIN_LABELS] ?? r.origin,
        fmt(r.expectedUsd),
        fmt(r.collectedUsd),
      ])
    );
  }
  if (dash.revenue.topCustomers.length > 0) {
    label("Largest customers this period", MARGIN, sheet.y);
    sheet.y += 12;
    grid(
      [
        { label: "Customer", width: 200 },
        { label: `Billed (${unitLabel})`, width: 154, numeric: true },
        { label: `Owed (${unitLabel})`, width: 153, numeric: true },
      ],
      dash.revenue.topCustomers
        .slice(0, 10)
        .map((c) => [
          c.name,
          fmt(c.expectedUsd),
          c.outstandingUsd > 0 ? fmt(c.outstandingUsd) : "settled",
        ])
    );
  }

  // ──────────────────────────────────────────────── 4. where it was spent ──
  section(
    4,
    "Where the money is spent",
    "A cost with a batch against it is a batch cost; one without is treated as office overhead. That is a reading of the record, not a field somebody sets."
  );
  line("Batch costs — moving the cargo", dash.expenses.batchUsd);
  line("Office costs — running the business", dash.expenses.officeUsd);
  if (dash.expenses.specialUsd > 0) line("Non-operating", dash.expenses.specialUsd);
  total("Total spent", dash.expenses.totalUsd, RED);
  if (dash.expenses.byCategory.length > 0) {
    for (const row of dash.expenses.byCategory.slice(0, 10)) {
      line(EXPENSE_CATEGORY_LABELS[row.category] ?? row.category, row.amount, {
        plain: `${fmt(row.amount)}    ${Math.round(row.share)}%`,
      });
      shareBar(row.share, AMBER);
    }
  }

  // ─────────────────────────────────────────────── 5. batch performance ──
  section(
    5,
    "Batch performance",
    "Cargo is the business and a batch is the unit it arrives in. Only costs tied to a dispatch are charged to it — rent and salaries belong to the company, not to one aeroplane."
  );
  if (dash.batches.length === 0) {
    line("No batches fall inside this period.", null, { plain: "—" });
  } else {
    grid(
      [
        { label: "Batch", width: 62 },
        { label: "From", width: 66 },
        { label: "Kg", width: 38, numeric: true },
        { label: `Billed (${unitLabel})`, width: 87, numeric: true },
        { label: `Collected (${unitLabel})`, width: 87, numeric: true },
        { label: `Owed (${unitLabel})`, width: 84, numeric: true },
        { label: `Profit (${unitLabel})`, width: 83, numeric: true },
      ],
      dash.batches.map((b) => [
        b.batchNumber,
        ORIGIN_LABELS[b.origin as keyof typeof ORIGIN_LABELS] ?? b.origin,
        b.kg.toFixed(0),
        fmt(b.expectedUsd),
        fmt(b.collectedUsd),
        fmt(b.outstandingUsd),
        fmt(b.profitUsd),
      ])
    );
  }

  // ──────────────────────────────────────────────── 6. financial position ──
  section(
    6,
    "Financial position",
    "Where the money is right now, derived from the ledger. Not a period figure — this is today's answer whichever period the statement covers."
  );
  if (dash.position.accounts.length > 0) {
    grid(
      [
        { label: "Account", width: 200 },
        { label: "Currency", width: 74 },
        { label: "Balance, as held", width: 120, numeric: true },
        { label: `Worth (${unitLabel})`, width: 113, numeric: true },
      ],
      dash.position.accounts.map((a) => [
        a.name,
        a.currency,
        a.balance.toLocaleString("en-US", { maximumFractionDigits: 0 }),
        fmt(a.balanceUsd),
      ])
    );
  }
  line("Cash and bank", dash.position.cashUsd);
  line("Owed to us by customers", dash.position.receivableUsd, { colour: GREEN });
  line("Owed by us", dash.position.payableUsd, { colour: RED });
  total(
    "Net position",
    dash.position.netUsd,
    dash.position.netUsd >= 0 ? GREEN : RED
  );

  // ─────────────────────────────────────────── 7. collection performance ──
  section(
    7,
    "Collection performance",
    "What was billed in this period against what has come in for it."
  );
  line("Billed", dash.collections.expectedUsd);
  line("Collected", dash.collections.collectedUsd, { colour: GREEN });
  line("Outstanding", dash.collections.outstandingUsd, {
    colour: dash.collections.outstandingUsd > 0 ? RED : INK,
  });
  line("Collection rate", null, {
    plain: dash.collections.rate === null ? "—" : `${dash.collections.rate}%`,
    strong: true,
  });
  rateBar(dash.collections.rate ?? 0, GREEN);
  grid(
    [
      { label: "Paid in full", width: 127, numeric: true },
      { label: "Part paid", width: 127, numeric: true },
      { label: "Not paid at all", width: 127, numeric: true },
      { label: "Awaiting verification", width: 126, numeric: true },
    ],
    [
      [
        String(dash.collections.paid),
        String(dash.collections.partiallyPaid),
        String(dash.collections.unpaid),
        String(dash.collections.awaitingVerification),
      ],
    ]
  );

  // ─────────────────────────────────────────────────── 8. business volume ──
  section(8, "Business volume", "What was physically moved and billed for.");
  grid(
    [
      { label: "Cargo received", width: 88, numeric: true },
      { label: "Cargo billed", width: 84, numeric: true },
      { label: "Cargo paid for", width: 86, numeric: true },
      { label: "Packages", width: 62, numeric: true },
      { label: "Customers", width: 66, numeric: true },
      { label: "Arrived", width: 60, numeric: true },
      { label: "Closed", width: 61, numeric: true },
    ],
    [
      [
        `${dash.volume.kgReceived.toFixed(0)} kg`,
        `${dash.volume.kgBilled.toFixed(0)} kg`,
        `${dash.volume.kgCollected.toFixed(0)} kg`,
        String(dash.volume.packages),
        String(dash.volume.customers),
        String(dash.volume.batchesArrived),
        String(dash.volume.batchesClosed),
      ],
    ]
  );

  // ──────────────────────────────────────────────────── 9. financial health ──
  if (dash.health.length > 0) {
    section(
      9,
      "Financial health",
      "The same measures the finance screen shows, each with what it means."
    );
    for (const metric of dash.health) {
      line(metric.label, null, {
        plain: metric.value,
        note: metric.explain,
        colour:
          metric.tone === "good" ? GREEN : metric.tone === "bad" ? RED : metric.tone === "warn" ? AMBER : INK,
      });
    }
  }

  sheet.signature(input.producedBy);
  return sheet.finish();
}
