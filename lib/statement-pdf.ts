import "server-only";

import { jsPDF } from "jspdf";

import { COMPANY, ORIGIN_LABELS } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import type { FinanceDashboard } from "@/lib/finance-dashboard";

/**
 * The whole set of books for one period, as a document somebody can hand over.
 *
 * A single report table printed to PDF is a page from the books, not the books.
 * What the boss, a bank or an auditor asks for is one document that answers
 * every question in order: what came in, what it cost, what is left, who owes
 * us, where the money sits, and which batches earned it. That is this.
 *
 * TWO CURRENCIES, ALWAYS. Shillings lead because that is the money in the
 * room — the till, the salary, the customer's hand. Dollars sit beside them
 * because that is what the invoice says and what the rate book is written in.
 * A statement that shows only one of the two forces its reader to convert, and
 * a reader converting in their head at a rate they half-remember is how two
 * people end up arguing about the same figure.
 *
 * Every number is derived from the operational record at the moment of
 * printing. Nothing here is stored, so a statement cannot drift away from the
 * screen it was printed from — and the rate it was converted at is stamped on
 * it, so two printings a month apart can be told apart rather than silently
 * disagreeing.
 */

const PAGE = { width: 595.28, height: 841.89 };
const M = { left: 42, right: 42, top: 52, bottom: 54 };
const RIGHT = PAGE.width - M.right;

/** Where the two money columns end. Right-aligned, so digits line up. */
const COL_USD = RIGHT;
const COL_TSH = RIGHT - 118;

type Pl = FinanceDashboard["pl"];

export function statementToPdf(input: {
  dash: FinanceDashboard;
  pl: Pl;
  prior: Pl;
  /** USD → TZS in force when this was printed. Null when none is published. */
  rate: number | null;
  /** "August 2026", "2026", "12 Aug 2026 – 15 Aug 2026". */
  periodLabel: string;
  /** The dates themselves, printed under the title so there is no ambiguity. */
  periodDates: string;
  previousLabel: string;
  producedBy: string;
}) {
  const { dash, pl, prior, rate, periodLabel, periodDates, previousLabel } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = M.top;
  let page = 1;

  // ─────────────────────────────────────────────────────────── primitives ──
  const setFont = (style: "normal" | "bold", size: number, grey = 0) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(grey);
  };

  /** Shillings, rounded — a fraction of a shilling has no physical form. */
  const tsh = (usd: number) =>
    rate === null ? "—" : `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`;
  const usd = (n: number) =>
    `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const footer = () => {
    setFont("normal", 7.5, 140);
    doc.text(
      `${COMPANY.name} · financial statement · ${periodLabel}`,
      M.left,
      PAGE.height - 32
    );
    doc.text(`${page}`, RIGHT, PAGE.height - 32, { align: "right" });
  };

  /** Break before writing something that will not fit whole. */
  const room = (needed: number) => {
    if (y + needed <= PAGE.height - M.bottom) return;
    footer();
    doc.addPage();
    page += 1;
    y = M.top;
  };

  const rule = (weight = 0.5, grey = 205) => {
    doc.setDrawColor(grey);
    doc.setLineWidth(weight);
    doc.line(M.left, y, RIGHT, y);
  };

  const section = (n: number, title: string, note?: string) => {
    room(note ? 62 : 48);
    y += 16;
    setFont("bold", 10.5, 0);
    doc.text(`${n}. ${title.toUpperCase()}`, M.left, y);
    y += 5;
    rule(0.8, 60);
    y += 13;
    if (note) {
      setFont("normal", 7.8, 120);
      const lines = doc.splitTextToSize(note, RIGHT - M.left);
      doc.text(lines, M.left, y);
      y += lines.length * 9 + 5;
    }
  };

  /** Column captions over the two money columns. */
  const moneyHeads = () => {
    /* Never last on a page: a caption whose figures are overleaf is worse than
       no caption, because the reader trusts it and reads the wrong column. */
    room(56);
    setFont("bold", 7, 130);
    doc.text("SHILLINGS", COL_TSH, y, { align: "right" });
    doc.text("DOLLARS", COL_USD, y, { align: "right" });
    y += 11;
  };

  /**
   * One line of the statement: what it is, in both currencies, and — when
   * there is one — how it moved against the period before.
   */
  const line = (
    label: string,
    amountUsd: number | null,
    opts: {
      strong?: boolean;
      indent?: number;
      note?: string;
      /** Printed in the right margin, e.g. "up 12% on last month". */
      move?: string | null;
      /** Neither currency — a count, a percentage, a weight. */
      plain?: string;
    } = {}
  ) => {
    room(18);
    setFont(opts.strong ? "bold" : "normal", opts.strong ? 9.5 : 9, opts.strong ? 0 : 45);
    doc.text(label, M.left + (opts.indent ?? 0), y);

    if (opts.plain !== undefined) {
      doc.text(opts.plain, COL_USD, y, { align: "right" });
    } else if (amountUsd !== null) {
      doc.text(tsh(amountUsd), COL_TSH, y, { align: "right" });
      doc.text(usd(amountUsd), COL_USD, y, { align: "right" });
    }

    if (opts.note || opts.move) {
      setFont("normal", 7.2, 140);
      doc.text(opts.note ?? opts.move ?? "", M.left + (opts.indent ?? 0) + 4, y + 8.5);
      y += 8.5;
    }
    y += 15;
  };

  const total = (label: string, amountUsd: number) => {
    room(26);
    y += 2;
    rule(0.5, 150);
    y += 13;
    setFont("bold", 10, 0);
    doc.text(label, M.left, y);
    doc.text(tsh(amountUsd), COL_TSH, y, { align: "right" });
    doc.text(usd(amountUsd), COL_USD, y, { align: "right" });
    y += 6;
    rule(0.8, 60);
    y += 14;
  };

  /** A real table, for the rows that are genuinely tabular. */
  const table = (
    heads: { label: string; width: number; align?: "right" }[],
    rows: string[][]
  ) => {
    const xs: number[] = [];
    let cursor = M.left;
    for (const h of heads) {
      xs.push(cursor);
      cursor += h.width;
    }
    const head = () => {
      room(30);
      setFont("bold", 7, 130);
      heads.forEach((h, i) => {
        doc.text(
          h.label.toUpperCase(),
          h.align === "right" ? xs[i] + h.width - 2 : xs[i],
          y,
          { align: h.align === "right" ? "right" : "left" }
        );
      });
      y += 5;
      rule(0.5, 200);
      y += 11;
    };
    head();
    for (const row of rows) {
      if (y + 14 > PAGE.height - M.bottom) {
        footer();
        doc.addPage();
        page += 1;
        y = M.top;
        head();
      }
      heads.forEach((h, i) => {
        /*
          Shrink to fit, never drop.

          This used to keep only the first line of a wrapped cell, so a figure
          wider than its column printed as "TSh" with the number gone — a
          silent, confident lie in a financial document. Now the cell steps its
          type down until the value fits, and only clips (visibly, with an
          ellipsis) when even that fails.
        */
        const raw = row[i] ?? "";
        let size = 8.2;
        setFont("normal", size, 30);
        while (doc.getTextWidth(raw) > h.width - 4 && size > 6) {
          size -= 0.3;
          setFont("normal", size, 30);
        }
        let text = raw;
        while (text.length > 1 && doc.getTextWidth(text) > h.width - 4) {
          text = `${text.slice(0, -2)}…`;
        }
        doc.text(text, h.align === "right" ? xs[i] + h.width - 2 : xs[i], y, {
          align: h.align === "right" ? "right" : "left",
        });
      });
      y += 14;
    }
    y += 4;
  };

  const move = (now: number, before: number) => {
    if (before === 0) return now === 0 ? null : `nothing comparable in ${previousLabel}`;
    const p = Math.round(((now - before) / Math.abs(before)) * 100);
    if (p === 0) return `unchanged on ${previousLabel}`;
    return `${p > 0 ? "up" : "down"} ${Math.abs(p)}% on ${previousLabel}`;
  };

  // ────────────────────────────────────────────────────────────── heading ──
  setFont("bold", 17, 0);
  doc.text(COMPANY.name, M.left, y);
  setFont("bold", 9, 0);
  doc.text("FINANCIAL STATEMENT", RIGHT, y - 9, { align: "right" });
  setFont("normal", 12, 0);
  doc.text(periodLabel, RIGHT, y + 8, { align: "right" });

  /* Clear of the period above it: at 12pt the month name's descenders were
     landing on the date range printed underneath. */
  y += 22;
  setFont("normal", 8.5, 110);
  doc.text(`${COMPANY.taglineEn} · ${COMPANY.phone} · ${COMPANY.email}`, M.left, y);
  doc.text(periodDates, RIGHT, y, { align: "right" });

  y += 10;
  rule(1.2, 30);
  y += 8;
  setFont("normal", 7.5, 130);
  doc.text(
    rate === null
      ? "No exchange rate has been published, so figures are shown in dollars only."
      : `Shillings converted at USD 1 = TSh ${rate.toLocaleString("en-US")}, the rate in force when this was printed. Dollars are what the invoices say.`,
    M.left,
    y + 8
  );
  y += 16;

  // ───────────────────────────────────────────────────────── 1. the answer ──
  section(
    1,
    "The period at a glance",
    "Every figure below is derived from the invoices, payments and costs already on record. There is no separate set of books."
  );
  moneyHeads();
  line("Revenue billed", pl.revenue, { move: move(pl.revenue, prior.revenue) });
  line("Costs incurred", pl.costs, { move: move(pl.costs, prior.costs) });
  total(pl.profit < 0 ? "Net loss for the period" : "Net profit for the period", pl.profit);
  line(
    "Profit margin",
    null,
    { plain: pl.margin === null ? "—" : `${pl.margin.toFixed(1)}%`, strong: false }
  );
  line("Money collected", pl.cashIn, { move: move(pl.cashIn, prior.cashIn) });
  line("Money paid out", pl.cashOut, { move: move(pl.cashOut, prior.cashOut) });
  line("Net cash movement", pl.netCash, { strong: true });

  // ──────────────────────────────────────────────── 2. profit and loss ──
  section(
    2,
    "Profit & loss — did the work make money",
    "Accrual basis: bills raised and costs incurred inside the period, whether or not anybody has paid yet. This is the figure that says whether the business works."
  );
  moneyHeads();
  line("Freight billed on confirmed invoices", pl.revenue, {
    note: `${pl.invoices} ${pl.invoices === 1 ? "invoice" : "invoices"}`,
  });
  y += 4;
  setFont("bold", 8, 90);
  doc.text("LESS COSTS", M.left, y);
  y += 13;
  for (const row of pl.categories) {
    line(
      EXPENSE_CATEGORY_LABELS[row.category] ?? row.category,
      row.amount,
      { indent: 12 }
    );
  }
  total("Total costs", pl.costs);
  total(pl.profit < 0 ? "NET LOSS" : "NET PROFIT", pl.profit);
  if (pl.specialCosts > 0) {
    line("Non-operating payments, kept out of the margin", pl.specialCosts, {
      note: `${pl.specialCount} ${pl.specialCount === 1 ? "payment" : "payments"} — real money out, but not a cost of moving cargo`,
    });
    line("Profit after those payments", pl.profitAfterSpecial, { strong: true });
  }

  // ──────────────────────────────────────────────────── 3. cash movement ──
  section(
    3,
    "Cash — did the money move",
    "What customers actually paid and what actually left an account inside the period. This is the figure that decides whether payroll can be met."
  );
  moneyHeads();
  line("Collected from customers", pl.cashIn);
  line("Paid out", pl.cashOut);
  total("Net cash movement", pl.netCash);

  // ─────────────────────────────────────────────── 4. revenue analysis ──
  section(
    4,
    "Where the revenue comes from",
    "Freight billed in this period. Every invoice belongs to a consignment — there is no other kind of income in the system."
  );
  moneyHeads();
  line("Expected", dash.revenue.expectedUsd);
  line("Collected", dash.revenue.collectedUsd);
  line("Still outstanding", dash.revenue.outstandingUsd, {
    note:
      dash.revenue.collectionRate === null
        ? undefined
        : `${dash.revenue.collectionRate}% of what was billed has come in`,
  });
  if (dash.revenue.byOrigin.length > 0) {
    y += 6;
    table(
      [
        { label: "Origin", width: 180 },
        { label: "Billed (TSh)", width: 110, align: "right" },
        { label: "Billed (USD)", width: 95, align: "right" },
        { label: "Collected (USD)", width: 126, align: "right" },
      ],
      dash.revenue.byOrigin.map((r) => [
        ORIGIN_LABELS[r.origin as keyof typeof ORIGIN_LABELS] ?? r.origin,
        tsh(r.expectedUsd),
        usd(r.expectedUsd),
        usd(r.collectedUsd),
      ])
    );
  }
  if (dash.revenue.topCustomers.length > 0) {
    room(40);
    setFont("bold", 8, 90);
    doc.text("LARGEST CUSTOMERS THIS PERIOD", M.left, y);
    y += 12;
    table(
      [
        { label: "Customer", width: 200 },
        { label: "Billed (TSh)", width: 110, align: "right" },
        { label: "Billed (USD)", width: 95, align: "right" },
        { label: "Owed (USD)", width: 106, align: "right" },
      ],
      dash.revenue.topCustomers.slice(0, 10).map((c) => [
        c.name,
        tsh(c.expectedUsd),
        usd(c.expectedUsd),
        c.outstandingUsd > 0 ? usd(c.outstandingUsd) : "settled",
      ])
    );
  }

  // ─────────────────────────────────────────────── 5. expense analysis ──
  section(
    5,
    "Where the money is spent",
    "A cost with a batch against it is a batch cost; one without is treated as office overhead. That is a reading of the record, not a field somebody sets."
  );
  moneyHeads();
  line("Batch costs — moving the cargo", dash.expenses.batchUsd);
  line("Office costs — running the business", dash.expenses.officeUsd);
  if (dash.expenses.specialUsd > 0) {
    line("Non-operating", dash.expenses.specialUsd);
  }
  total("Total spent", dash.expenses.totalUsd);
  if (dash.expenses.byCategory.length > 0) {
    table(
      [
        { label: "Category", width: 200 },
        { label: "Amount (TSh)", width: 115, align: "right" },
        { label: "Amount (USD)", width: 100, align: "right" },
        { label: "Share", width: 96, align: "right" },
      ],
      dash.expenses.byCategory.map((c) => [
        EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
        tsh(c.amount),
        usd(c.amount),
        `${Math.round(c.share)}%`,
      ])
    );
  }

  // ────────────────────────────────────────────── 6. batch performance ──
  section(
    6,
    "Batch performance",
    "Cargo is the business and a batch is the unit it arrives in. Only costs tied to a dispatch are charged to it — rent and salaries belong to the company, not to one aeroplane."
  );
  if (dash.batches.length === 0) {
    line("No batches fall inside this period.", null, { plain: "" });
  } else {
    /* Widths sized to the widest figure these columns actually hold — a
       shilling total on a good batch runs to "TSh 22,913,415", and a column
       too narrow for it silently printed "TSh" and dropped the number. */
    table(
      [
        { label: "Batch", width: 60 },
        { label: "From", width: 62 },
        { label: "Kg", width: 36, align: "right" },
        { label: "Billed (TSh)", width: 90, align: "right" },
        { label: "Collected (TSh)", width: 90, align: "right" },
        { label: "Owed (TSh)", width: 87, align: "right" },
        { label: "Profit (TSh)", width: 86, align: "right" },
      ],
      dash.batches.map((b) => [
        b.batchNumber,
        ORIGIN_LABELS[b.origin as keyof typeof ORIGIN_LABELS] ?? b.origin,
        b.kg.toFixed(0),
        tsh(b.expectedUsd),
        tsh(b.collectedUsd),
        tsh(b.outstandingUsd),
        tsh(b.profitUsd),
      ])
    );
    setFont("normal", 7.2, 140);
    doc.text(
      "In dollars, the same batches: " +
        dash.batches
          .slice(0, 6)
          .map((b) => `${b.batchNumber} ${usd(b.profitUsd)}`)
          .join("  ·  "),
      M.left,
      y
    );
    y += 12;
  }

  // ───────────────────────────────────────────── 7. financial position ──
  section(
    7,
    "Financial position",
    "Where the money is right now, derived from the ledger. Not a period figure — this is today's answer whichever period the statement covers."
  );
  if (dash.position.accounts.length > 0) {
    table(
      [
        { label: "Account", width: 220 },
        { label: "Currency", width: 80 },
        { label: "Balance", width: 105, align: "right" },
        { label: "In dollars", width: 106, align: "right" },
      ],
      dash.position.accounts.map((a) => [
        a.name,
        a.currency,
        a.balance.toLocaleString("en-US", { maximumFractionDigits: 0 }),
        usd(a.balanceUsd),
      ])
    );
  }
  moneyHeads();
  line("Cash and bank", dash.position.cashUsd);
  line("Owed to us by customers", dash.position.receivableUsd);
  line("Owed by us", dash.position.payableUsd);
  total("Net position", dash.position.netUsd);

  // ────────────────────────────────────────── 8. collection performance ──
  section(
    8,
    "Collection performance",
    "What was billed in this period against what has come in for it."
  );
  moneyHeads();
  line("Billed", dash.collections.expectedUsd);
  line("Collected", dash.collections.collectedUsd);
  line("Outstanding", dash.collections.outstandingUsd);
  line("Collection rate", null, {
    plain: dash.collections.rate === null ? "—" : `${dash.collections.rate}%`,
    strong: true,
  });
  line("Invoices paid in full", null, { plain: String(dash.collections.paid) });
  line("Part paid", null, { plain: String(dash.collections.partiallyPaid) });
  line("Not paid at all", null, { plain: String(dash.collections.unpaid) });
  line("Payments awaiting verification", null, {
    plain: String(dash.collections.awaitingVerification),
  });

  // ───────────────────────────────────────────────── 9. business volume ──
  section(9, "Business volume", "What was physically moved and billed for.");
  line("Cargo received", null, { plain: `${dash.volume.kgReceived.toFixed(1)} kg` });
  line("Cargo billed", null, { plain: `${dash.volume.kgBilled.toFixed(1)} kg` });
  line("Cargo paid for", null, { plain: `${dash.volume.kgCollected.toFixed(1)} kg` });
  line("Packages handled", null, { plain: String(dash.volume.packages) });
  line("Customers served", null, { plain: String(dash.volume.customers) });
  line("Batches arrived", null, { plain: String(dash.volume.batchesArrived) });
  line("Batches closed", null, { plain: String(dash.volume.batchesClosed) });

  // ──────────────────────────────────────────────── 10. financial health ──
  if (dash.health.length > 0) {
    section(
      10,
      "Financial health",
      "The same measures the finance screen shows, each with what it means."
    );
    for (const metric of dash.health) {
      line(metric.label, null, { plain: metric.value, note: metric.explain });
    }
  }

  // ─────────────────────────────────────────────────────────── signature ──
  room(80);
  y += 18;
  rule(0.5, 200);
  y += 16;
  setFont("normal", 8, 90);
  doc.text(`Prepared by ${input.producedBy}`, M.left, y);
  doc.text(
    `Printed ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    RIGHT,
    y,
    { align: "right" }
  );
  y += 30;
  doc.setDrawColor(170);
  doc.line(M.left, y, M.left + 170, y);
  doc.line(RIGHT - 170, y, RIGHT, y);
  y += 11;
  setFont("normal", 7.5, 130);
  doc.text("Finance", M.left, y);
  doc.text("Approved by", RIGHT - 170, y);

  footer();
  return Buffer.from(doc.output("arraybuffer"));
}
