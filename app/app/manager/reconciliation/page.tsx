import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Building2,
  CircleDot,
  Download,
  FileText,
  Flag,
  MessageCircleQuestion,
  Paperclip,
  Scale,
  Search as SearchIcon,
  Smartphone,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { ReconcileNav } from "@/components/app/reconcile-nav";
import { ReviewActions } from "@/components/app/review-actions";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { reviewHistory } from "@/lib/control";
import { formatDate, formatDateTime, formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings } from "@/lib/money";
import { profitByDispatch } from "@/lib/profit";
import { can } from "@/lib/rbac";
import { reconciliation } from "@/lib/reconciliation";
import {
  KIND_LABEL,
  QUEUE_STATES,
  accountPositions,
  queueTotals,
  reconciliationQueue,
  type QueueRow,
  type QueueState,
} from "@/lib/reconciliation-workspace";
import { reviewsFor } from "@/lib/control";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reconciliation" };

/**
 * THE MANAGER'S CONTROL CENTRE, NOT A REPORT.
 *
 * The owner's instruction, in full: "THE MANAGER MUST BE ABLE TO DO THE WORK
 * FROM THIS PAGE. This is not a reporting page. It is a financial CONTROL AND
 * ACTION CENTER." What stood here before was a wall of checks that told him
 * things were wrong and gave him nowhere to say anything about it.
 *
 * NOTHING HERE IS A SECOND SET OF BOOKS. Every row is a LedgerEntry, an account
 * or a batch Finance already recorded. A verdict is an append-only ManagerReview
 * kept BESIDE the record, and an account check is an AccountReconciliation kept
 * beside the account — reviewing a payment never edits the payment, which is
 * the rule the whole control layer is built on.
 *
 * THE TWO WORDS THAT MUST NEVER BLUR. "System" is what the ledger says, derived
 * from its own lines and typed by nobody. "Actual" is what somebody proved from
 * outside — a statement, a phone, a till count. They are labelled as such
 * everywhere on this page, because a screen that mixes them certifies nothing.
 */

const STATE_STYLE: Record<QueueState, { label: string; chip: string; dot: string; icon: LucideIcon }> = {
  PENDING: {
    label: "Pending",
    chip: "border-warning/40 bg-warning/10 text-warning",
    dot: "bg-warning",
    icon: CircleDot,
  },
  MISMATCH: {
    label: "Mismatch",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    icon: AlertTriangle,
  },
  SENT_BACK: {
    label: "Sent back",
    chip: "border-warning/40 bg-warning/10 text-warning",
    dot: "bg-warning",
    icon: Undo2,
  },
  FLAGGED: {
    label: "Flagged",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    icon: Flag,
  },
  INFO_REQUESTED: {
    label: "Information requested",
    chip: "border-info/40 bg-info/10 text-info",
    dot: "bg-info",
    icon: MessageCircleQuestion,
  },
  UNDER_REVIEW: {
    label: "Under review",
    chip: "border-brand/40 bg-brand/10 text-brand",
    dot: "bg-brand",
    icon: SearchIcon,
  },
  RECONCILED: {
    label: "Reconciled",
    chip: "border-success/40 bg-success/10 text-success",
    dot: "bg-success",
    icon: BadgeCheck,
  },
};

/* The four the owner asked to lead, in the order he wrote them. The other
   three are still filters below; a summary card each would be seven boxes
   saying what four can. */
const SUMMARY: QueueState[] = ["PENDING", "MISMATCH", "UNDER_REVIEW", "RECONCILED"];

const ACCOUNT_ICON: Record<string, LucideIcon> = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
};

type Params = Record<string, string | undefined>;

/** Every link on this page keeps the filters you are standing in. */
function withParams(params: Params, changes: Params) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value) next.set(key, value);
  }
  /* A new filter always returns you to the first page; keeping page=3 while
     narrowing to four rows shows an empty list and reads as a bug. */
  if (!("page" in changes)) next.delete("page");
  const query = next.toString();
  return `/app/manager/reconciliation${query ? `?${query}` : ""}`;
}

function StateChip({ state, locale }: { state: QueueState; locale: Locale }) {
  const meta = STATE_STYLE[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.chip
      )}
    >
      <Icon className="h-3 w-3" />
      {t(locale, meta.label)}
    </span>
  );
}

/** What a row is about, in one line, without opening it. */
function rowTitle(entry: QueueRow, locale: Locale) {
  if (entry.payment?.invoice?.customer?.name) return entry.payment.invoice.customer.name;
  if (entry.expense?.vendor) return entry.expense.vendor;
  if (entry.transfer) {
    return `${entry.transfer.fromAccount.name} → ${entry.transfer.toAccount.name}`;
  }
  return entry.description || t(locale, KIND_LABEL[entry.kind] ?? entry.kind);
}

function documentsOf(entry: QueueRow) {
  const docs: { label: string; url: string }[] = [];
  for (const proof of entry.payment?.proofs ?? []) {
    docs.push({ label: "Payment proof", url: proof.url });
  }
  for (const receipt of entry.expense?.receipts ?? []) {
    docs.push({ label: "Expense receipt", url: receipt.url });
  }
  return docs;
}

export default async function ManagerReconciliation({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const params = await searchParams;

  const canReview = can(user.role, "record.review");
  const canReconcile = can(user.role, "account.reconcile");

  const [queue, positions, checks, rateRow, batches, totals] = await Promise.all([
    reconciliationQueue(params),
    accountPositions(),
    reconciliation(locale),
    currentRate(),
    profitByDispatch(6),
    queueTotals(params),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const shillings = (usd: number) => formatShillings(usd, rate);

  /* The selected row, and it is fetched rather than assumed to be on this page:
     a link from the control room lands here with a tx that the current filters
     may exclude, and answering that with "nothing selected" would be a dead
     end from the one screen that sent you. */
  const selectedId = params.tx;
  const onPage = queue.entries.find((entry) => entry.id === selectedId);
  const selected: QueueRow | null =
    onPage ??
    (selectedId
      ? ((await prisma.ledgerEntry.findUnique({
          where: { id: selectedId },
          include: {
            account: { select: { id: true, name: true, currency: true, kind: true } },
            recordedBy: { select: { name: true } },
            payment: {
              select: {
                id: true,
                method: true,
                reference: true,
                note: true,
                paidAt: true,
                voidedAt: true,
                receipt: { select: { receiptNumber: true } },
                proofs: { select: { url: true } },
                receivedBy: { select: { name: true } },
                invoice: {
                  select: {
                    invoiceNumber: true,
                    creditStatus: true,
                    customer: { select: { name: true, phone: true } },
                    shipment: {
                      select: { trackingNumber: true, batch: { select: { batchNumber: true } } },
                    },
                  },
                },
              },
            },
            expense: {
              select: {
                id: true,
                expenseNumber: true,
                description: true,
                vendor: true,
                category: true,
                status: true,
                batch: { select: { batchNumber: true } },
                receipts: { select: { url: true } },
              },
            },
            transfer: {
              select: {
                transferNumber: true,
                reason: true,
                fromAccount: { select: { name: true } },
                toAccount: { select: { name: true } },
              },
            },
          },
        })) as QueueRow | null)
      : queue.entries[0] ?? null);

  const selectedStanding = selected
    ? (await reviewsFor("LEDGER_ENTRY", [selected.id])).get(selected.id) ?? null
    : null;
  const selectedState: QueueState = (selectedStanding?.state as QueueState) ?? "PENDING";
  const history = selected ? await reviewHistory("LEDGER_ENTRY", selected.id) : [];
  const selectedAccount = selected
    ? positions.find((position) => position.id === selected.account.id) ?? null
    : null;

  /*
    THE NEXT ONE STILL WAITING, so a verdict is a rhythm rather than a round
    trip. The owner, looking at twenty-seven pending records: "how do i confim
    that one by one". After this one, in the order he is already reading — and
    wrapping back to the top if he started in the middle.
  */
  const currentIndex = selected
    ? queue.entries.findIndex((entry) => entry.id === selected.id)
    : -1;
  const nextPending =
    queue.entries.slice(currentIndex + 1).find((entry) => entry.state === "PENDING") ??
    queue.entries.find(
      (entry) => entry.state === "PENDING" && entry.id !== selected?.id
    ) ??
    null;

  const reviewed = queue.total - queue.counts.PENDING;
  const progress = queue.total > 0 ? Math.round((queue.counts.RECONCILED / queue.total) * 100) : 0;

  const chosenAccount = params.account
    ? positions.find((position) => position.id === params.account) ?? null
    : null;

  const batchStandings = await reviewsFor(
    "BATCH",
    batches.map((batch) => batch.id)
  );


  const faults = checks.checks.filter((check) => !check.ok);
  /* What each other tab is carrying, so the row says where the work is rather
     than making him open all four to find out. */
  const accountsWaiting = positions.filter(
    (position) => !position.lastCheck || position.movedSinceCheck
  ).length;
  const batchesWaiting = batches.filter((batch) => !batchStandings.get(batch.id)).length;

  return (
    <>
      <PageHeader
        title={t(locale, "Reconciliation")}
        description={t(
          locale,
          "Review and reconcile what Finance recorded against the money the accounts actually hold."
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            {canReconcile ? (
              <Link
                href="#accounts"
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
              >
                <Scale className="h-4 w-4" />
                {t(locale, "Reconcile an account")}
              </Link>
            ) : null}
            <a
              href={`/app/manager/reconciliation/export${
                new URLSearchParams(
                  Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]
                ).toString()
                  ? `?${new URLSearchParams(
                      Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]
                    ).toString()}`
                  : ""
              }`}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              {t(locale, "Export")}
            </a>
          </div>
        }
      />

      <ReconcileNav
        counts={{
          "/app/manager/reconciliation": queue.counts.PENDING,
          "/app/manager/reconciliation/accounts": accountsWaiting,
          "/app/manager/reconciliation/batches": batchesWaiting,
          "/app/manager/reconciliation/checks": faults.length,
        }}
      />

      {/*
        WHERE THE WORK STANDS, in one line and four doors.

        The bar counts RECONCILED against everything inside the current filters,
        so narrowing to one account or one week re-reads it rather than leaving
        a month's percentage over a week's list.
      */}
      <section className="mb-5 rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t(locale, "Reconciliation progress")}</p>
            {/* Two different questions, and the card was printing them as one:
                the percentage is what has been AGREED, the second figure is
                what has been LOOKED AT. A record sent back has been looked at
                and is not agreed, which is precisely the gap worth seeing. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {queue.counts.RECONCILED.toLocaleString("en-US")} {t(locale, "of")}{" "}
              {queue.total.toLocaleString("en-US")} {t(locale, "agreed")}
              {reviewed > queue.counts.RECONCILED ? (
                <>
                  {" · "}
                  {(reviewed - queue.counts.RECONCILED).toLocaleString("en-US")}{" "}
                  {t(locale, "looked at and still open")}
                </>
              ) : null}
            </p>
          </div>
          <p className="font-display text-[26px] font-bold leading-none tabular-nums">
            {progress}%
          </p>
        </div>
        {/*
          THE MIX, NOT A PERCENTAGE OF ONE COLOUR.

          A single green bar at 0% is a grey rail that says nothing about what
          the other hundred per cent is. Every state takes its share of the same
          rail in its own colour, so the shape of the month is one glance:
          mostly amber is untouched work, red is what disagrees, green is done.
        */}
        <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          {QUEUE_STATES.filter((state) => queue.counts[state] > 0).map((state) => (
            <span
              key={state}
              aria-hidden
              title={`${t(locale, STATE_STYLE[state].label)}: ${queue.counts[state]}`}
              className={cn(
                "h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500 ease-out-expo",
                STATE_STYLE[state].dot
              )}
              style={{
                width: `${queue.total > 0 ? (queue.counts[state] / queue.total) * 100 : 0}%`,
              }}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {SUMMARY.map((state) => {
            const meta = STATE_STYLE[state];
            const Icon = meta.icon;
            const active = params.status === state;
            return (
              <Link
                key={state}
                href={withParams(params, { status: active ? undefined : state, tx: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  /* Each card carries its own status colour rather than four
                     grey boxes with a coloured freckle — the owner: "it does
                     nt gave colors and the cards are boring". Colour here is
                     the meaning: amber waiting, red disagreeing, blue being
                     looked into, green agreed. */
                  "focus-ring group rounded-lg border p-3 transition-all hover:-translate-y-px",
                  meta.chip,
                  active && "ring-2 ring-offset-2 ring-offset-card"
                )}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  <Icon className="h-3.5 w-3.5" />
                  {t(locale, meta.label)}
                </p>
                <p className="mt-1.5 font-display text-[24px] font-bold leading-none tabular-nums">
                  {queue.counts[state].toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
                  {queue.total > 0
                    ? `${Math.round((queue.counts[state] / queue.total) * 100)}%`
                    : "—"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------- filters */}
      <section className="mb-4">
        <form
          action="/app/manager/reconciliation"
          className="rounded-xl border bg-card p-3 shadow-soft"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder={t(
                  locale,
                  "Reference, receipt, invoice, customer, batch, vendor…"
                )}
                aria-label={t(locale, "Search")}
              />
            </div>
            <NativeSelect name="account" defaultValue={params.account ?? ""} aria-label={t(locale, "Account")}>
              <option value="">{t(locale, "All accounts")}</option>
              {queue.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="kind" defaultValue={params.kind ?? ""} aria-label={t(locale, "Type")}>
              <option value="">{t(locale, "All types")}</option>
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(locale, label)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="person"
              defaultValue={params.person ?? ""}
              aria-label={t(locale, "Recorded by")}
            >
              <option value="">{t(locale, "Anyone")}</option>
              {queue.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="period" defaultValue={params.period ?? ""} aria-label={t(locale, "Period")}>
              <option value="">{t(locale, "Any date")}</option>
              <option value="today">{t(locale, "Today")}</option>
              <option value="yesterday">{t(locale, "Yesterday")}</option>
              <option value="week">{t(locale, "This week")}</option>
              <option value="month">{t(locale, "This month")}</option>
              <option value="year">{t(locale, "This year")}</option>
            </NativeSelect>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="focus-ring inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
            >
              {t(locale, "Filter")}
            </button>
            <Link
              href="/app/manager/reconciliation"
              className="focus-ring inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t(locale, "Clear")}
            </Link>
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          </div>
        </form>

        {/* Every state, including the three the summary cards do not carry. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={withParams(params, { status: undefined, tx: undefined })}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              !params.status ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-muted"
            )}
          >
            {t(locale, "All")}
            <span className="tabular-nums opacity-75">{queue.total}</span>
          </Link>
          {QUEUE_STATES.map((state) => {
            const meta = STATE_STYLE[state];
            const active = params.status === state;
            return (
              <Link
                key={state}
                href={withParams(params, { status: active ? undefined : state, tx: undefined })}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active ? meta.chip : "bg-card hover:bg-muted"
                )}
              >
                {t(locale, meta.label)}
                <span className="tabular-nums opacity-75">{queue.counts[state]}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- workspace */}
      <section className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/*
          THE LEFT COLUMN CARRIES TWO THINGS, so it stops being half empty.

          The queue is short on a quiet week and the record beside it is long
          whatever the week, which left a column of nothing under the list —
          the hole the owner keeps sending screens back for. The books' own
          arithmetic checks used to be a band at the foot of the page; they
          belong beside the work rather than under it, and they fill exactly
          the space the queue does not.
        */}
        <div className="space-y-4">
        <div className="rounded-xl border bg-card shadow-soft">
          <div className="border-b px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">
                {t(locale, "Records to check")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {queue.filteredTotal.toLocaleString("en-US")} {t(locale, "shown")}
              </p>
            </div>
            {/*
              WHAT THIS VIEW ADDS UP TO, summed in the database over every row
              the filters match rather than over the forty on screen. It is not
              the register's running balance and does not pretend to be: it
              answers "how much money am I looking at" for the pile in front of
              him — "this week, CRDB, still pending" states its own size.
            */}
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/30 px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, "In")}
                </dt>
                <dd className="font-mono text-xs font-semibold tabular-nums text-success">
                  {shillings(totals.inUsd)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/30 px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, "Out")}
                </dt>
                <dd className="font-mono text-xs font-semibold tabular-nums text-destructive">
                  {shillings(totals.outUsd)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/30 px-2 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, "Net")}
                </dt>
                <dd
                  className={cn(
                    "font-mono text-xs font-bold tabular-nums",
                    totals.netUsd < 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {shillings(totals.netUsd)}
                </dd>
              </div>
            </dl>
          </div>

          {queue.entries.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t(locale, "Nothing here")}
                description={t(locale, "No record matches these filters.")}
              />
            </div>
          ) : (
            <ul className="max-h-[34rem] divide-y overflow-y-auto">
              {queue.entries.map((entry) => {
                const active = selected?.id === entry.id;
                const out = entry.direction === "OUT";
                return (
                  <li key={entry.id}>
                    <Link
                      href={withParams(params, { tx: entry.id })}
                      scroll={false}
                      className={cn(
                        "focus-ring block border-l-2 px-4 py-2.5 transition-colors hover:bg-muted/40",
                        active
                          ? "border-l-brand bg-brand/[0.06]"
                          : "border-l-transparent"
                      )}
                    >
                      {/*
                        TWO LINES, AND A BADGE ONLY WHERE ONE MEANS SOMETHING.

                        Every row wore an amber "Pending" chip on a line of its
                        own — twenty-seven identical badges saying the same
                        thing, on a list whose default filter is Pending. They
                        cost a third of the row's height to repeat what the
                        heading already said, and they drowned the handful of
                        rows that really do carry a verdict. Untouched is now
                        the absence of a badge; anything else shows.
                      */}
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium">{rowTitle(entry, locale)}</p>
                        <p
                          className={cn(
                            "shrink-0 font-mono text-sm font-semibold tabular-nums",
                            out ? "text-destructive" : "text-success"
                          )}
                        >
                          {out ? "−" : "+"}
                          {formatMoney(toNumber(entry.amount), entry.currency)}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(entry.occurredAt, locale)} ·{" "}
                          {t(locale, KIND_LABEL[entry.kind] ?? entry.kind)} · {entry.account.name}
                        </p>
                        {entry.state === "PENDING" ? null : (
                          <StateChip state={entry.state} locale={locale} />
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {queue.pages > 1 ? (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
              <Link
                href={withParams(params, { page: String(Math.max(1, queue.page - 1)) })}
                aria-disabled={queue.page === 1}
                className={cn(
                  "focus-ring rounded px-2 py-1",
                  queue.page === 1 ? "pointer-events-none text-muted-foreground/50" : "hover:bg-muted"
                )}
              >
                {t(locale, "Previous")}
              </Link>
              <span className="text-muted-foreground">
                {queue.page} / {queue.pages}
              </span>
              <Link
                href={withParams(params, { page: String(Math.min(queue.pages, queue.page + 1)) })}
                aria-disabled={queue.page === queue.pages}
                className={cn(
                  "focus-ring rounded px-2 py-1",
                  queue.page === queue.pages
                    ? "pointer-events-none text-muted-foreground/50"
                    : "hover:bg-muted"
                )}
              >
                {t(locale, "Next")}
              </Link>
            </div>
          ) : null}
        </div>

        </div>

        {/* the record under the manager's eye */}
        <div id="record" className="scroll-mt-4 rounded-xl border bg-card shadow-soft lg:sticky lg:top-4">
          {!selected ? (
            <div className="p-4">
              <EmptyState
                title={t(locale, "Nothing selected")}
                description={t(locale, "Pick a record from the list to check it.")}
              />
            </div>
          ) : (
            <div className="divide-y">
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold">
                      {rowTitle(selected, locale)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      {selected.entryNumber}
                      <StateChip state={selectedState} locale={locale} />
                    </p>
                  </div>
                  {/* The figure the verdict is about, beside the name of the
                      thing it belongs to rather than in a band of its own. */}
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "font-display text-[22px] font-bold leading-none tabular-nums",
                        selected.direction === "OUT" ? "text-destructive" : "text-success"
                      )}
                    >
                      {selected.direction === "OUT" ? "−" : "+"}
                      {formatMoney(toNumber(selected.amount), selected.currency)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatMoney(toNumber(selected.amountUsd), "USD")}{" "}
                      {t(locale, "on the invoice")}
                    </p>
                  </div>
                </div>
                <Link
                  href={withParams(params, { tx: undefined })}
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {t(locale, "Back to the list")}
                </Link>
              </div>

              {/*
                ONE BAND OF FACTS, NOT FOUR.

                This panel printed the record's own description three times —
                as the heading, as the REFERENCE and again as DESCRIPTION — over
                six labelled sections, and the owner could not read it: "the
                arragement is not nice and big cnfusing". The amount belongs in
                the heading beside the name; the account's position is one line;
                the fields that repeat what is already on screen are dropped
                rather than restated.

                What does NOT get merged is system against actual. A transaction
                has no "actual" of its own — there is no outside figure per line,
                only per account — so the account's pair is stated as the
                account's, under its own name, and never as this record's.
              */}
              <div className="px-4 py-3">
                <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {[
                    [t(locale, "Type"), t(locale, KIND_LABEL[selected.kind] ?? selected.kind)],
                    [t(locale, "Date"), formatDate(selected.occurredAt, locale)],
                    [t(locale, "Account"), selected.account.name],
                    [t(locale, "Recorded by"), selected.recordedBy?.name ?? "—"],
                    [t(locale, "Recorded at"), formatDateTime(selected.createdAt, locale)],
                    [
                      t(locale, "Method"),
                      selected.payment?.method
                        ? t(locale, PAYMENT_METHOD_LABELS[selected.payment.method])
                        : "",
                    ],
                    [t(locale, "Reference"), selected.payment?.reference ?? ""],
                    [t(locale, "Receipt"), selected.payment?.receipt?.receiptNumber ?? ""],
                    [t(locale, "Invoice"), selected.payment?.invoice?.invoiceNumber ?? ""],
                    [
                      t(locale, "Batch"),
                      selected.payment?.invoice?.shipment?.batch?.batchNumber ??
                        selected.expense?.batch?.batchNumber ??
                        "",
                    ],
                    [t(locale, "Customer"), selected.payment?.invoice?.customer?.name ?? ""],
                    [t(locale, "Vendor"), selected.expense?.vendor ?? ""],
                  ]
                    /* Empty is not information, and neither is a field that
                       repeats the heading two centimetres above it. */
                    .filter(
                      ([, value]) =>
                        value && value !== "—" && value !== rowTitle(selected, locale)
                    )
                    .map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="truncate">{value}</dd>
                      </div>
                    ))}
                </dl>

                {selected.description &&
                selected.description !== rowTitle(selected, locale) ? (
                  <p className="mt-2 text-xs leading-snug text-muted-foreground">
                    {selected.description}
                  </p>
                ) : null}
              </div>

              {/* The account's own pair, on one line, under the account's name. */}
              {selectedAccount ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-muted/20 px-4 py-2 text-xs">
                  <span className="font-medium">{selectedAccount.name}</span>
                  <span className="flex flex-wrap items-baseline gap-x-4 font-mono tabular-nums">
                    <span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t(locale, "System")}{" "}
                      </span>
                      {formatMoney(selectedAccount.systemBalance, selectedAccount.currency)}
                    </span>
                    <span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t(locale, "Actual")}{" "}
                      </span>
                      {selectedAccount.lastCheck
                        ? formatMoney(
                            selectedAccount.lastCheck.actualBalance,
                            selectedAccount.currency
                          )
                        : t(locale, "never checked")}
                    </span>
                    {selectedAccount.lastCheck ? (
                      <span
                        className={cn(
                          "font-semibold",
                          Math.abs(selectedAccount.lastCheck.difference) < 0.01
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {t(locale, "Difference")}{" "}
                        </span>
                        {formatMoney(
                          selectedAccount.lastCheck.difference,
                          selectedAccount.currency
                        )}
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}

              {/* Evidence: the documents themselves, or the single sentence that
                  matters when there are none. It used to be said twice — once as
                  a headline reading "None" and once as a paragraph. */}
              <div className="px-4 py-3">
                {documentsOf(selected).length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-warning">
                    <Paperclip className="h-3.5 w-3.5" />
                    {t(locale, "No document attached. Ask for it before agreeing this one.")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Evidence")}
                    </span>
                    {documentsOf(selected).map((doc, index) => (
                      <a
                        key={`${doc.url}-${index}`}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 text-xs font-medium text-success hover:bg-success/15"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {t(locale, doc.label)}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* the verdict */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(locale, "Your verdict")}
                </p>
                {canReview ? (
                  <ReviewActions
                    /*
                      KEYED ON THE RECORD, so moving to the next one is a fresh
                      panel. Without it React keeps the same instance: the "one
                      per verdict" latch never resets and the second record he
                      agrees goes nowhere, while the first one's success message
                      hangs over it saying something was recorded.
                    */
                    key={selected.id}
                    className="mt-2"
                    target="LEDGER_ENTRY"
                    targetId={selected.id}
                    nextHref={
                      nextPending ? withParams(params, { tx: nextPending.id }) : undefined
                    }
                    nextLabel={nextPending ? rowTitle(nextPending, locale) : undefined}
                    facts={[
                      {
                        label: "Record",
                        value: selected.entryNumber,
                      },
                      {
                        label: "System amount",
                        value: `${selected.direction === "OUT" ? "−" : "+"}${formatMoney(
                          toNumber(selected.amount),
                          selected.currency
                        )}`,
                        tone: selected.direction === "OUT" ? "bad" : "good",
                      },
                      {
                        label: "Account actual",
                        value: selectedAccount?.lastCheck
                          ? formatMoney(
                              selectedAccount.lastCheck.actualBalance,
                              selectedAccount.currency
                            )
                          : t(locale, "never checked"),
                      },
                      {
                        label: "Account difference",
                        value: selectedAccount?.lastCheck
                          ? formatMoney(
                              selectedAccount.lastCheck.difference,
                              selectedAccount.currency
                            )
                          : "—",
                        tone:
                          selectedAccount?.lastCheck &&
                          Math.abs(selectedAccount.lastCheck.difference) >= 0.01
                            ? "bad"
                            : undefined,
                      },
                    ]}
                    offer={
                      selectedState === "MISMATCH" || selectedState === "FLAGGED"
                        ? ["UNDER_REVIEW", "SENT_BACK", "INFO_REQUESTED", "RECONCILED"]
                        : ["RECONCILED", "SENT_BACK", "FLAGGED", "INFO_REQUESTED", "UNDER_REVIEW"]
                    }
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(locale, "Reading only — recording a verdict is the manager's and the owner's.")}
                  </p>
                )}
              </div>

              {/* and everything ever said about it */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(locale, "History")}
                </p>
                <ol className="mt-2 space-y-2">
                  <li className="flex gap-2 text-xs">
                    <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0">
                      <span className="text-muted-foreground">
                        {formatDateTime(selected.createdAt, locale)} ·{" "}
                      </span>
                      {t(locale, "Recorded by")} {selected.recordedBy?.name ?? "—"}
                    </span>
                  </li>
                  {history.map((row) => {
                    const meta = STATE_STYLE[row.state as QueueState] ?? STATE_STYLE.PENDING;
                    return (
                      <li key={row.id} className="flex gap-2 text-xs">
                        <span aria-hidden className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                        <span className="min-w-0">
                          <span className="text-muted-foreground">
                            {formatDateTime(row.createdAt, locale)} ·{" "}
                          </span>
                          {t(locale, meta.label)} — {row.reviewedBy.name}
                          {row.reason ? (
                            <span className="block text-muted-foreground">{row.reason}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t(locale, "Append-only. Nothing here can be edited or removed.")}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

    </>
  );
}
