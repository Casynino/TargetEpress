import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Paperclip,
  Plane,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { recordAudit } from "@/lib/audit";
import { BATCH_STATUS_META, ORIGIN_LABELS } from "@/lib/constants";
import { creditByBatch } from "@/lib/credit-queries";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeDashboard, type BatchPerformance } from "@/lib/finance-dashboard";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import {
  formatLocal,
  formatShillings,
  formatShillingTotal,
  formatUsd,
} from "@/lib/money";
import { windowFor } from "@/lib/profit";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Batch finances") };
}

/**
 * The manager's batch control desk: every flight's figures, the costs behind
 * them line by line, and a place to say a batch's numbers look wrong.
 *
 * THIS PAGE COMPUTES NO FINANCIAL FIGURE. The per-batch money is
 * financeDashboard's own BatchPerformance — the same rows the owner's screen
 * ranks — and the credit column is the credit book's answer, exactly as
 * /app/manager/finance reads both. A control page with its own arithmetic
 * would eventually disagree with the figures it exists to control, and then
 * every dispute it raised would start with an argument about the page itself.
 *
 * AND IT EDITS NO FINANCIAL RECORD. The owner's rule: a manager disputing a
 * figure must not touch the figure. A verdict here is one appended
 * ManagerReview row kept BESIDE the batch — Finance still sees exactly what
 * was recorded, plus the fact that a manager disputes it and why. The desk
 * then corrects through the normal correction path, which writes reversing
 * entries rather than edits, and answers with a new verdict row. The batch's
 * current standing is simply its newest row.
 */

/** The verdicts this desk can hand down, and the sentence each one writes. */
const VERDICTS: Record<
  string,
  { audit: string; summary: (batchNumber: string, reason: string) => string }
> = {
  /* Handed back to the desk that recorded it. The strongest verdict here —
     and still not an edit. */
  SENT_BACK: {
    audit: "batch.sentBack",
    summary: (n, r) => `Sent ${n} back to Finance — figures disputed: ${r}`,
  },
  /* Parked deliberately: being looked into, not yet handed back. */
  UNDER_REVIEW: {
    audit: "batch.flagged",
    summary: (n, r) => `Flagged ${n} for review: ${r}`,
  },
  /* The way back out. Without it a batch once sent back would read as
     disputed forever, however thoroughly Finance corrected it. */
  RECONCILED: {
    audit: "batch.reviewAgreed",
    summary: (n, r) => `Agreed the figures on ${n}: ${r}`,
  },
};

/**
 * One verdict, appended.
 *
 * A plain create, deliberately without the conditional-updateMany claim the
 * money actions use: nothing is being claimed. Two managers flagging the same
 * batch in the same second produce two rows and the newest wins, which is the
 * append-only contract working, not a race.
 *
 * An inline action rather than lib/actions/control.ts with useActionState,
 * because this page is a server component with no client wrapper file, and a
 * plain form posts fine without one. Errors travel back as a query param the
 * page reads — cruder than FormError, but it survives with JavaScript off.
 */
async function reviewBatch(formData: FormData) {
  "use server";
  const user = await authorize("record.review");
  const batchId = String(formData.get("batchId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!batchId || !(verdict in VERDICTS)) redirect("/app/manager/batches");
  /* Required for every verdict, not only SENT_BACK. An append-only register
     whose rows explain themselves is the whole value of keeping one. */
  if (!reason) {
    redirect(`/app/manager/batches?note=reason&batch=${batchId}#b-${batchId}`);
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { batchNumber: true },
  });
  if (!batch) redirect("/app/manager/batches");

  await prisma.managerReview.create({
    data: {
      target: "BATCH",
      targetId: batchId,
      state: verdict as "SENT_BACK" | "UNDER_REVIEW" | "RECONCILED",
      reason,
      reviewedById: user.id,
    },
  });
  await recordAudit({
    actor: user,
    action: VERDICTS[verdict].audit,
    entity: "Batch",
    entityId: batchId,
    summary: VERDICTS[verdict].summary(batch.batchNumber, reason),
    metadata: { state: verdict, reason },
  });

  revalidatePath("/app/manager/batches");
  redirect(`/app/manager/batches?note=recorded&batch=${batchId}#b-${batchId}`);
}

/** A cost line, flattened to what the register shows. */
type CostLine = {
  id: string;
  category: string;
  special: boolean;
  description: string;
  /** Exact shillings when it was paid in shillings; null means convert. */
  tsh: number | null;
  usd: number;
  incurredAt: Date;
  recordedBy: string | null;
  receipts: { id: string; url: string }[];
};

/** A batch's newest verdict — its current standing. */
type Standing = {
  state: string;
  reason: string | null;
  createdAt: Date;
  reviewedBy: string;
};

type Row = BatchPerformance & {
  creditUsd: number;
  costs: CostLine[];
  specialUsd: number;
  standing: Standing | null;
};

/**
 * What the table can be ordered by. A number or null, never a stand-in: a
 * flight that billed nothing has no margin, and nulls sort last both ways
 * rather than ranking an unbilled flight beside one that genuinely lost money.
 */
const SORTS: Record<string, (row: Row) => number | null> = {
  margin: (r) => r.marginPct,
  profit: (r) => r.profitUsd,
  revenue: (r) => r.expectedUsd,
  collected: (r) => r.collectedUsd,
  credit: (r) => r.creditUsd,
  outstanding: (r) => r.outstandingUsd,
  expenses: (r) => r.expensesUsd,
  kg: (r) => r.kg,
};

/** How each standing reads. Tones follow the reconciliation page's verdicts. */
const STANDING_BADGE: Record<string, { label: string; className: string }> = {
  SENT_BACK: {
    label: "Sent back",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  MISMATCH: {
    label: "Mismatch",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  /* Reachable from the reconciliation workspace, which offers a flag on a
     batch as well as on a line. Without these two a flagged batch fell through
     to the PENDING badge and read as unread. */
  FLAGGED: {
    label: "Flagged",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  INFO_REQUESTED: {
    label: "Information requested",
    className: "border-info/40 bg-info/10 text-info",
  },
  UNDER_REVIEW: {
    label: "Under review",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  PENDING: {
    label: "Awaiting a look",
    className: "border bg-muted text-muted-foreground",
  },
  RECONCILED: {
    label: "Figures agreed",
    className: "border-success/40 bg-success/10 text-success",
  },
};

function StandingBadge({ standing, locale }: { standing: Standing; locale: Locale }) {
  const meta = STANDING_BADGE[standing.state] ?? STANDING_BADGE.PENDING;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
    >
      {t(locale, meta.label)}
    </span>
  );
}

export default async function ManagerBatches({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    note?: string;
    batch?: string;
  }>;
}) {
  const user = await requirePermission("profit.view");
  const canReview = can(user.role, "record.review");
  const locale = await viewerLocale();
  const { sort, dir, note, batch: notedBatch } = await searchParams;

  /*
    financeDashboard wants a period even though a batch's figures are lifetime
    and ignore it. The engine computes more than this page reads — that is the
    accepted price of there being exactly one answer to "what did this flight
    make". The rejected alternative, a slimmer local query over the same
    tables, is a second set of books with a head start of zero days.
  */
  const picked = windowFor("month", locale);
  const [dash, credit, rateRow] = await Promise.all([
    financeDashboard(picked.window, picked.previous),
    /* Credit per flight from the credit book, not re-derived from invoices —
       "released on terms" is a different fact from "not yet paid". */
    creditByBatch(),
    currentRate(),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (usd: number) => formatShillings(usd, rate);
  /* A flight's own totals were added up as shillings by the engine, so print
     those rather than multiplying the dollar snapshot back: a cost of
     TSh 20,000 is stored as USD 7.41, and 7.41 × 2,700 is 20,007. The same
     rows on the Manager's Finance page always printed the exact figure, so
     the two screens disagreed on the same flight. See lib/money-totals.ts. */
  const exact = (local: number, usd: number) =>
    formatShillingTotal(local, usd, rate);
  const ids = dash.batches.map((b) => b.id);

  const [costRows, reviewRows] = await Promise.all([
    /* The lines BEHIND the engine's expense figure — record detail, not a
       second total. Voids stay out on the same basis the engine keeps them
       out; special costs come along so the register shows everything that was
       recorded, and are marked below as outside profit. */
    prisma.expense.findMany({
      where: { batchId: { in: ids }, status: { not: "VOID" } },
      orderBy: { amountUsd: "desc" },
      select: {
        id: true,
        batchId: true,
        category: true,
        expenseClass: true,
        description: true,
        amount: true,
        currency: true,
        amountUsd: true,
        incurredAt: true,
        recordedBy: { select: { name: true } },
        receipts: { select: { id: true, url: true } },
      },
    }),
    /* Newest first, so the first row seen per batch IS its current standing.
       The whole history stays in the table; this page only rules on "now". */
    prisma.managerReview.findMany({
      where: { target: "BATCH", targetId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: {
        targetId: true,
        state: true,
        reason: true,
        createdAt: true,
        reviewedBy: { select: { name: true } },
      },
    }),
  ]);

  const costsFor = new Map<string, CostLine[]>();
  for (const c of costRows) {
    if (!c.batchId) continue;
    const list = costsFor.get(c.batchId) ?? [];
    list.push({
      id: c.id,
      category: c.category,
      special: c.expenseClass === "NON_OPERATING",
      description: c.description,
      /* A shilling cost is already an exact shilling figure; converting it to
         dollars and back rounds it twice — the same rule batch-finance applies
         to its own shilling total. Only dollar costs are converted. */
      tsh: c.currency === "TZS" ? toNumber(c.amount) : null,
      usd: toNumber(c.amountUsd),
      incurredAt: c.incurredAt,
      recordedBy: c.recordedBy?.name ?? null,
      receipts: c.receipts,
    });
    costsFor.set(c.batchId, list);
  }

  const standingFor = new Map<string, Standing>();
  for (const r of reviewRows) {
    if (standingFor.has(r.targetId)) continue;
    standingFor.set(r.targetId, {
      state: r.state,
      reason: r.reason,
      createdAt: r.createdAt,
      reviewedBy: r.reviewedBy.name,
    });
  }

  const creditFor = new Map(credit.map((c) => [c.batchId, c.creditUsd]));

  /*
    Every batch the engine ranks, including the ones still loading or in the
    air. A flight in transit already carries customs and permits worth this
    desk's attention, and the null-margin rule below keeps it from being
    ranked as the worst performer while nothing has been billed against it.
  */
  const rows: Row[] = dash.batches.map((b) => {
    const costs = costsFor.get(b.id) ?? [];
    return {
      ...b,
      creditUsd: creditFor.get(b.id) ?? 0,
      costs,
      specialUsd: costs.filter((c) => c.special).reduce((n, c) => n + c.usd, 0),
      standing: standingFor.get(b.id) ?? null,
    };
  });

  /* Worst margin first is the default and the point: the batches that need a
     decision, not the ones that read best. */
  const sortKey = sort && sort in SORTS ? sort : "margin";
  const descending = dir ? dir === "desc" : sortKey !== "margin";
  const sorted = [...rows].sort((a, b) => {
    const left = SORTS[sortKey](a);
    const right = SORTS[sortKey](b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return descending ? right - left : left - right;
  });

  const losing = rows.filter((r) => r.profitUsd < 0).length;
  const disputed = rows.filter(
    (r) => r.standing?.state === "SENT_BACK" || r.standing?.state === "UNDER_REVIEW"
  ).length;

  /** Column headers keep the sort in the URL, so a sorted view can be sent. */
  const sortHref = (key: string) => {
    const params = new URLSearchParams();
    params.set("sort", key);
    if (sortKey === key) params.set("dir", descending ? "asc" : "desc");
    else if (key === "margin") params.set("dir", "asc");
    return `/app/manager/batches?${params.toString()}`;
  };

  /** Opens one batch's cost register server-side, keeping the sort. */
  const openHref = (id: string) => {
    const params = new URLSearchParams();
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    params.set("batch", id);
    return `/app/manager/batches?${params.toString()}#b-${id}`;
  };

  const columns: { key: string; label: string; hide?: string }[] = [
    { key: "kg", label: "Kg", hide: "hidden lg:table-cell" },
    { key: "revenue", label: "Revenue" },
    { key: "collected", label: "Collected", hide: "hidden lg:table-cell" },
    { key: "credit", label: "Credit", hide: "hidden xl:table-cell" },
    { key: "outstanding", label: "Outstanding", hide: "hidden lg:table-cell" },
    { key: "expenses", label: "Expenses", hide: "hidden xl:table-cell" },
    { key: "profit", label: "Profit / loss" },
    { key: "margin", label: "Margin" },
  ];

  const batchLine = (row: Row) =>
    `${t(
      locale,
      ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ?? row.origin
    )} · ${
      row.arrivedAt
        ? formatDate(row.arrivedAt, locale)
        : t(
            locale,
            BATCH_STATUS_META[row.status as keyof typeof BATCH_STATUS_META]
              ?.label ?? row.status
          )
    } · ${row.cargo} ${t(locale, "consignments")}`;

  return (
    <>
      <PageHeader
        title={t(locale, "Batch finances")}
        description={t(
          locale,
          "Every flight's figures with the costs behind them, and a verdict kept beside the batch when they look wrong. Nothing here edits a record — a dispute goes back to Finance, who correct through reversing entries."
        )}
      />

      {/* ─────────────────────────────── §5 the ranking ──────────────────── */}
      <SectionLabel count={losing}>
        {t(locale, "Every flight, worst margin first")}
      </SectionLabel>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Lifetime figures from the same engine the owner reads — a flight's money does not stop at a month boundary."
        )}{" "}
        {losing > 0
          ? `${losing} ${t(
              locale,
              losing === 1 ? "flight is losing money." : "flights are losing money."
            )}`
          : t(locale, "None of them is losing money.")}
        {disputed > 0
          ? ` ${disputed} ${t(
              locale,
              disputed === 1
                ? "batch stands disputed below."
                : "batches stand disputed below."
            )}`
          : ""}
      </p>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Plane}
          title={t(locale, "No batch to control yet")}
          description={t(
            locale,
            "A batch appears here as soon as it exists, with whatever costs and billing it has so far."
          )}
        />
      ) : (
        <>
          {/*
            The comparison table on a desk, the same rows as cards on a phone.

            NOT components/app/data-table.tsx, for the reason its other server
            caller (app/app/manager/finance) already wrote down: that is a
            client component whose columns are functions, and functions cannot
            cross the server/client boundary — every caller of it is a client
            wrapper file of its own, which this change is not allowed to add.
            Its two behaviours that matter are reproduced: it sorts (through
            the URL, so a sorted view can be sent to somebody) and it becomes
            cards below `md`.
          */}
          <div className="mb-4 hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Batch")}</TableHead>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={`text-right ${column.hide ?? ""}`}
                      aria-sort={
                        sortKey === column.key
                          ? descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <Link
                        href={sortHref(column.key)}
                        className="focus-ring inline-flex items-center gap-1 rounded hover:text-foreground"
                      >
                        {t(locale, column.label)}
                        {sortKey === column.key ? (
                          <IconHint
                            label={t(
                              locale,
                              descending ? "Largest first" : "Smallest first"
                            )}
                          >
                            {descending ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUp className="h-3 w-3" />
                            )}
                          </IconHint>
                        ) : null}
                      </Link>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">
                    {t(locale, "Standing")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow
                    key={row.id}
                    className={row.profitUsd < 0 ? "bg-destructive/5" : undefined}
                  >
                    <TableCell className="py-2">
                      {/* Into the flight's own book, not its manifest. A
                          manager reading these figures and wanting to know why
                          one of them says that was being sent to a list of
                          cargo; the answer is the payments and the costs. */}
                      <Link
                        href={`/app/finance/batches/${row.id}`}
                        className="focus-ring rounded font-mono text-xs hover:text-brand"
                      >
                        {row.batchNumber}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {batchLine(row)}
                      </p>
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs lg:table-cell">
                      {row.kg.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="tabular py-2 text-right text-xs">
                      {exact(row.expectedLocal, row.expectedUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-success lg:table-cell">
                      {exact(row.collectedLocal, row.collectedUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-brand xl:table-cell">
                      {money(row.creditUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-signal lg:table-cell">
                      {exact(row.outstandingLocal, row.outstandingUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-destructive xl:table-cell">
                      {exact(row.expensesLocal, row.expensesUsd)}
                    </TableCell>
                    <TableCell
                      className={`tabular py-2 text-right text-xs font-semibold ${
                        row.profitUsd < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {row.profitUsd < 0 ? "− " : ""}
                      {exact(Math.abs(row.profitLocal), Math.abs(row.profitUsd))}
                    </TableCell>
                    <TableCell
                      className={`tabular py-2 text-right text-xs ${
                        (row.marginPct ?? 0) < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {row.marginPct === null ? "—" : `${row.marginPct.toFixed(0)}%`}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Link href={openHref(row.id)} className="focus-ring rounded">
                        {row.standing ? (
                          <StandingBadge standing={row.standing} locale={locale} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {row.costs.length}{" "}
                            {t(locale, row.costs.length === 1 ? "cost" : "costs")}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phones: one card per flight, same order as the table. */}
          <ul className="mb-4 space-y-2 md:hidden">
            {sorted.map((row) => (
              <li
                key={row.id}
                className={`rounded-xl border p-3 ${
                  row.profitUsd < 0
                    ? "border-destructive/30 bg-destructive/5"
                    : "bg-card"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/app/batches/${row.id}`}
                    className="focus-ring rounded font-mono text-sm hover:text-brand"
                  >
                    {row.batchNumber}
                  </Link>
                  <span
                    className={`tabular inline-flex items-center gap-1 text-sm font-semibold ${
                      row.profitUsd < 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {row.profitUsd < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {row.profitUsd < 0 ? "− " : ""}
                    {exact(Math.abs(row.profitLocal), Math.abs(row.profitUsd))}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {batchLine(row)} ·{" "}
                  {row.marginPct === null
                    ? t(locale, "nothing billed")
                    : `${row.marginPct.toFixed(0)}% ${t(locale, "margin")}`}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { k: "Revenue", v: exact(row.expectedLocal, row.expectedUsd), tone: "" },
                    { k: "Collected", v: exact(row.collectedLocal, row.collectedUsd), tone: "text-success" },
                    { k: "Credit", v: money(row.creditUsd), tone: "text-brand" },
                    { k: "Outstanding", v: exact(row.outstandingLocal, row.outstandingUsd), tone: "text-signal" },
                    { k: "Expenses", v: exact(row.expensesLocal, row.expensesUsd), tone: "text-destructive" },
                  ].map((cell) => (
                    <div
                      key={cell.k}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="text-muted-foreground">{t(locale, cell.k)}</dt>
                      <dd className={`tabular ${cell.tone}`}>{cell.v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {row.standing ? (
                    <StandingBadge standing={row.standing} locale={locale} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {row.costs.length}{" "}
                      {t(locale, row.costs.length === 1 ? "cost" : "costs")}
                    </span>
                  )}
                  <Link
                    href={openHref(row.id)}
                    className="focus-ring rounded text-[11px] font-semibold text-brand hover:underline"
                  >
                    {t(locale, "Costs & verdict")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {/* ───────────────────────────── §6 the costs ──────────────────── */}
          <SectionLabel count={disputed}>
            {t(locale, "The costs behind each flight")}
          </SectionLabel>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {t(
              locale,
              "Each cost with who recorded it, when, and the receipt if one was attached. A batch whose figures look wrong is sent back or flagged from here — the verdict sits beside the record and edits nothing."
            )}
          </p>

          <div className="space-y-2">
            {sorted.map((row) => {
              /* A disputed batch arrives open: its standing and reason are the
                 first thing this desk must see, not a click away. */
              const open =
                notedBatch === row.id ||
                row.standing?.state === "SENT_BACK" ||
                row.standing?.state === "UNDER_REVIEW";
              const operating = row.costs.filter((c) => !c.special);
              return (
                <details
                  key={row.id}
                  id={`b-${row.id}`}
                  open={open}
                  className="group rounded-xl border bg-card"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-3 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform group-open:rotate-90" />
                    <span className="font-mono text-xs font-semibold">
                      {row.batchNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {batchLine(row)}
                    </span>
                    {row.standing ? (
                      <StandingBadge standing={row.standing} locale={locale} />
                    ) : null}
                    <span className="tabular text-xs font-semibold">
                      {exact(row.expensesLocal, row.expensesUsd)}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {row.costs.length}{" "}
                        {t(locale, row.costs.length === 1 ? "cost" : "costs")}
                      </span>
                    </span>
                  </summary>

                  <div className="border-t px-3 pb-3">
                    {note === "reason" && notedBatch === row.id ? (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        {t(
                          locale,
                          "A verdict needs its reason — say what looks wrong before it goes back."
                        )}
                      </p>
                    ) : null}
                    {note === "recorded" && notedBatch === row.id ? (
                      <p className="mt-2 text-xs font-medium text-success">
                        {t(
                          locale,
                          "Verdict recorded beside the batch. The figures themselves are untouched."
                        )}
                      </p>
                    ) : null}

                    {row.costs.length === 0 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {t(locale, "No cost has been recorded against this flight.")}
                      </p>
                    ) : (
                      <ul className="mt-1 divide-y">
                        {row.costs.map((cost) => (
                          <li
                            key={cost.id}
                            className="flex items-baseline justify-between gap-3 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs">
                                {t(
                                  locale,
                                  EXPENSE_CATEGORY_LABELS[cost.category] ??
                                    cost.category
                                )}
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {cost.description}
                                </span>
                                {cost.special ? (
                                  /* Real money, deliberately outside batch
                                     profit — see lib/expenses.ts on classes. */
                                  <span className="ml-1.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-[11px] font-semibold text-warning">
                                    {t(locale, "Special — outside profit")}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {cost.recordedBy ?? t(locale, "recorder unknown")} ·{" "}
                                {formatDate(cost.incurredAt, locale)}
                                {cost.receipts.length > 0 ? (
                                  <>
                                    {" · "}
                                    <a
                                      href={cost.receipts[0].url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="focus-ring inline-flex items-center gap-1 rounded hover:text-brand"
                                    >
                                      <Paperclip className="h-3 w-3" />
                                      {cost.receipts.length === 1
                                        ? t(locale, "receipt")
                                        : `${cost.receipts.length} ${t(locale, "receipts")}`}
                                    </a>
                                  </>
                                ) : (
                                  <> · {t(locale, "no receipt")}</>
                                )}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="tabular text-xs font-medium">
                                {cost.tsh !== null
                                  ? formatLocal(cost.tsh)
                                  : formatShillings(cost.usd, rate)}
                              </p>
                              <p className="tabular font-mono text-[11px] text-muted-foreground">
                                {formatUsd(cost.usd)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {row.specialUsd > 0 ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t(locale, "Operating costs")} {exact(row.expensesLocal, row.expensesUsd)} ·{" "}
                        {money(row.specialUsd)}{" "}
                        {t(
                          locale,
                          "of special costs are listed above and kept out of this flight's profit."
                        )}
                        {operating.length === 0
                          ? ` ${t(locale, "Every cost on this flight is special.")}`
                          : ""}
                      </p>
                    ) : null}

                    {row.standing ? (
                      <div
                        className={`mt-2 rounded-lg border p-2 ${
                          row.standing.state === "SENT_BACK" ||
                          row.standing.state === "MISMATCH"
                            ? "border-destructive/30 bg-destructive/[0.03]"
                            : row.standing.state === "UNDER_REVIEW"
                              ? "border-warning/30 bg-warning/[0.05]"
                              : "bg-muted/30"
                        }`}
                      >
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <StandingBadge standing={row.standing} locale={locale} />
                          {row.standing.reviewedBy} ·{" "}
                          {formatDateTime(row.standing.createdAt, locale)}
                        </p>
                        {row.standing.reason ? (
                          <p className="mt-1 text-xs">
                            “{row.standing.reason}”
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {canReview ? (
                      <form action={reviewBatch} className="mt-2 border-t pt-2">
                        <input type="hidden" name="batchId" value={row.id} />
                        <label
                          htmlFor={`reason-${row.id}`}
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          {t(locale, "What looks wrong (optional)")}
                        </label>
                        <Textarea
                          id={`reason-${row.id}`}
                          name="reason"
                          rows={2}
                          className="mt-1 min-h-0 text-xs"
                          placeholder={t(
                            locale,
                            "e.g. Customs appears twice and the transport figure has no receipt"
                          )}
                        />
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Button
                            type="submit"
                            name="verdict"
                            value="SENT_BACK"
                            variant="destructive"
                            size="sm"
                          >
                            {t(locale, "Send back to Finance")}
                          </Button>
                          <Button
                            type="submit"
                            name="verdict"
                            value="UNDER_REVIEW"
                            variant="outline"
                            size="sm"
                          >
                            {t(locale, "Flag for review")}
                          </Button>
                          {row.standing && row.standing.state !== "RECONCILED" ? (
                            /* The way back out, offered only while there is a
                               dispute to close. */
                            <Button
                              type="submit"
                              name="verdict"
                              value="RECONCILED"
                              variant="outline"
                              size="sm"
                              className="text-success"
                            >
                              {t(locale, "Figures agreed")}
                            </Button>
                          ) : null}
                        </div>
                      </form>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
