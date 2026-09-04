import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  CalendarClock,
  Download,
  FileText,
  MessageCircle,
  PackageOpen,
  Search,
} from "lucide-react";

import { AskForCredit, CreditOnRow } from "@/components/app/ask-for-credit";
import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/app/record-payment-dialog";
import { IconHint } from "@/components/app/icon-hint";
import { RecordIncome } from "@/components/app/record-income";
import { SearchBox } from "@/components/app/search-box";
import { Input } from "@/components/ui/input";
import { activeAccounts } from "@/lib/accounts";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { currentRate, formatLocal, formatShillings, formatUsd } from "@/lib/fx";
import { formatDate, toNumber } from "@/lib/format";
import { collectionsOverview } from "@/lib/collections";
import { t } from "@/lib/i18n";
import { paymentReminderSwahili, whatsappLink } from "@/lib/messages";
import { requirePermission } from "@/lib/session";
import {
  FOLLOW_UP_FILTERS,
  FOLLOW_UP_SORTS,
  sortFollowUp,
  type FollowUpSort,
  followUpQueue,
  followUpTotals,
  matchesFilter,
  type FollowUpFilter,
  type FollowUpRow,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Payment follow-up") };
}

/**
 * The chase list.
 *
 * One flat table, ranked, with the counts on every filter computed from the
 * whole queue rather than the visible page — a desk that works a queue needs to
 * trust the number on the pill.
 *
 * It carries credit as well as cash now (§14), and the point of the row design
 * is that the two never look alike. A cash bill that is unpaid is late by
 * default. A credit is late only after a date this company granted, so a credit
 * inside its terms is drawn quietly, ranked below a paid consignment waiting for
 * collection, and labelled as the arrangement working — because ringing a
 * customer who is inside terms we gave them is worse than not ringing at all.
 *
 * It lives under /app/collections, not /app/support, because chasing a payment
 * is not a support-desk activity — it is the collections job, and Finance does
 * more of it than Support does. Under the support prefix it was gated on
 * ticket.manage, which Finance does not hold, so every link Finance had to this
 * page — from their own ledger, their dashboard and the Collections tab row —
 * landed on "That area is not yours".
 *
 * The body was always role-aware and is unchanged: whoever can record a payment
 * records it, and whoever can only submit one submits it for verification.
 */
export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    record?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission("collections.view");
  /* Support files a claim, Finance banks it — the record screen behind this knows
     which of the two is standing there, so one button serves both. */
  const canTakePayments = can(user.role, "payment.submit");
  /* Finance banks it; Support files a claim against it. */
  const canBankIt = can(user.role, "payment.record");
  /* Both desks name an account now — see paymentSchema.accountId — so the
     list is fetched whichever desk is reading, and canBankIt still decides
     whether this records the money or claims it. */
  const payAccounts = await activeAccounts();
  const locale = await viewerLocale();
  /* Asking for a consignment to be released unpaid. Support and Finance both
     hold it; the desk on the phone is the one being asked for terms. */
  const canAskForCredit = can(user.role, "credit.request");
  /* Granting it — the decision that lets cargo leave without money. Finance's
     alone, and it is what makes the credit icon a different job for them. */
  const canDecideCredit = can(user.role, "credit.approve");
  const canRecord = can(user.role, "payment.record");
  const canCollect = !canRecord && can(user.role, "payment.submit");
  const { filter, q, record, sort, page } = await searchParams;
  const query = q?.trim() ?? "";

  // Credit only for a reader entitled to it. Every desk that can open this page
  // holds credit.view today, so this changes nothing on screen — it is here so
  // the day one does not, the queue drops the credit rows instead of the guard
  // being a JSX condition somebody edits around later.
  const rows = await followUpQueue({ credit: can(user.role, "credit.view") });

  /**
   * Shillings for the band totals.
   *
   * Each ROW converts at its own invoice's frozen rate — that is the figure
   * the customer was quoted. A total across many invoices has no single frozen
   * rate to use, so it converts at today's published one and is a live
   * estimate rather than a sum of quoted figures. The dollar figure beneath it
   * is the exact one.
   *
   * Through formatShillings rather than the `rate ? … : …` this page used to
   * carry, which wrote the amount as "TZS 202,500" — the stored ISO code, not
   * the "TSh" the ledger and every dashboard print. One list quoting a currency
   * the screen beside it does not is the exact thing lib/money.ts exists to
   * stop.
   */
  const [rateRow, overview] = await Promise.all([
    currentRate(),
    collectionsOverview(),
  ]);
  const liveRate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (usd: number) => formatShillings(usd, liveRate);
  /**
   * The exact dollar figure, printed only where the line above it is a
   * conversion. With no rate published formatShillings prints dollars itself,
   * and the same figure twice reads as two different currencies.
   */
  const inUsd = (usd: number) => (liveRate === null ? null : formatUsd(usd));

  /**
   * What the customer reads. Built here so the figures come off the same row
   * the clerk is looking at, and so nobody composes the same message eighty
   * times a day.
   */
  const invoiceMessage = (row: FollowUpRow) =>
    paymentReminderSwahili({
      customerName: row.customerName,
      trackingNumber: row.trackingNumber ?? "",
      /* English, not the clerk's language — the message is Swahili to a
         Tanzanian customer and must not carry 普通百货. */
      description: row.descriptionForCustomer,
      invoiceNumber: row.invoiceNumber,
      weightKg: row.weightKg,
      // The rate the cargo was actually charged at, composed once in
      // followUpQueue so this screen and the invoice cannot state it
      // differently.
      freightBasis: row.freightBasis,
      // The invoice's own rate, so the figure the customer was quoted is the
      // figure they are reminded of.
      exchangeRate: row.exchangeRate,
      amountUsd: row.outstanding,
      amountLocal: row.outstandingLocal,
      localCurrency: row.localCurrency,
    });

  /**
   * What a credit customer reads, and why it is not the message above.
   *
   * The standard reminder tells the customer their cargo has arrived and is
   * being held until payment clears. A credit customer is holding their cargo —
   * that was the whole arrangement — so sending them that message tells them the
   * one thing they know to be untrue, and the conversation starts with the desk
   * being wrong. This one talks about the bill and its date instead, and says
   * nothing about where the boxes are.
   */
  const creditMessage = (row: FollowUpRow) => {
    const credit = row.credit;
    // Dated in English regardless of who is at the keyboard: the message is
    // Swahili to a Tanzanian customer, and a clerk reading the app in Chinese
    // must not send them 2026年8月17日.
    const due = credit?.dueDate ? formatDate(credit.dueDate, "en") : null;
    const amount =
      row.outstandingLocal !== null
        ? formatLocal(row.outstandingLocal, row.localCurrency ?? undefined)
        : money(row.outstanding ?? 0);
    return [
      `Habari ${row.customerName.split(" ")[0]},`,
      ``,
      (credit?.daysOverdue ?? 0) > 0
        ? `Tunakumbusha malipo ya invoice ${row.invoiceNumber ?? ""}${due ? ` yaliyopaswa kulipwa ${due}` : ""}.`
        : `Tunakumbusha kuwa invoice ${row.invoiceNumber ?? ""}${due ? ` inapaswa kulipwa ${due}` : ""}.`,
      `Kiasi: ${amount}`,
    ].join("\n");
  };

  const active = (FOLLOW_UP_FILTERS.find((f) => f.key === filter)?.key ??
    "all") as FollowUpFilter;
  /*
    Search the row, not the database.

    Everything shown here is already in memory — this queue is bounded by how
    many bills are open, not by how many the company has ever raised — so the
    search matches exactly what a person can see on the row: the customer, the
    tracking number, the invoice and the phone they would dial. Sending it to
    the database would mean a second definition of "matches", and the two would
    disagree the first time a column changed.
  */
  /* Newest arrivals lead unless the desk says otherwise — see sortFollowUp. */
  const order = (FOLLOW_UP_SORTS.find((o) => o.key === sort)?.key ??
    "newest") as FollowUpSort;

  const needle = query.toLowerCase();
  const visible = rows
    .filter((row) => matchesFilter(row, active))
    .filter((row) =>
      needle.length === 0
        ? true
        : [
            row.customerName,
            row.trackingNumber,
            row.invoiceNumber ?? "",
            row.customerPhone ?? "",
            row.description ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
    );
  const ordered = sortFollowUp(visible, order);

  /*
    Rendered a page at a time.

    Every figure above and every count on every pill still comes from the WHOLE
    queue — `visible`, not this slice — because a desk working a queue has to be
    able to trust the number on the pill. What is paged is only the markup.

    It was rendering all 134 rows, which is 3.4MB of HTML for one screen and
    close to three seconds before anything appears. The rows are about eleven
    kilobytes each and the count grows with the business, so this got worse
    every week rather than staying still.
  */
  const PAGE_SIZE = 40;
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const shown = ordered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  /* Carries the reader's filter, order and search from page to page — losing
     any of them mid-queue is how somebody works the same rows twice. */
  const pageHref = (n: number) =>
    `/app/collections/follow-up?filter=${active}&sort=${order}${
      query ? `&q=${encodeURIComponent(query)}` : ""
    }${n > 1 ? `&page=${n}` : ""}`;

  /* Added up in one place for both this strip and the support desk's copy of the
     queue, and deliberately never added to each other: an unpaid bill and a
     credit inside terms are two different things to do on a Tuesday morning. */
  const totals = followUpTotals(visible);

  return (
    <>
      <PageHeader
        title="Payment follow-up"
        description="Every customer who owes us money — bills nobody has paid and credit we released on terms. Newest arrivals first; sort and filter it however the job needs."
        /* The action belongs on the page where the call happens: this IS the
           list of people who might ring back to say they have paid. */
        actions={
          canTakePayments ? (
            <>
              {/* The customer who rings back to say they have paid often has
                  three consignments and has sent one transfer for all of them.
                  Settling those one at a time makes three receipts and three
                  account movements for a deposit the bank shows once, so the
                  way to do it properly belongs on the page where that call is
                  answered. */}
              <Button asChild variant="outline" size="sm">
                <Link href="/app/finance/payments/new">
                  <Banknote className="mr-2 h-4 w-4" />
                  {t(locale, "Merge Payment")}
                </Link>
              </Button>
              {/* Credit beside the two payment doors, because it is the third
                  answer to the same phone call: they have paid, they are
                  paying several at once, or they want time. */}
              {canAskForCredit ? (
                <AskForCredit rate={liveRate} canApprove={canDecideCredit} />
              ) : null}
              {/* ?record=1 opens the panel on arrival, so the sidebar's
                  Record Payment row lands on the form rather than on a page
                  with a button to press a second time. */}
              <RecordIncome
                accounts={payAccounts}
                rate={liveRate}
                canRecord={canBankIt}
                autoOpen={record === "1"}
              />
            </>
          ) : null
        }
      />
      {/*
        The finance tab row stays put.

        Collections is a tab of Finance AND a workspace of its own, so opening
        it used to swap the whole tab row out — and getting back to the ledger
        or the overview meant going down to the sidebar. The owner called that
        inconvenient and he is right: a tab that removes its own tab bar leaves
        the reader with nowhere to go but back.

        Two rows, but hierarchical rather than identical: where you are in
        Finance, then where you are inside Collections. Only shown to a reader
        who has the finance tabs at all — Support shares this workspace and
        must not be given doors it cannot open.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceNav tabs={financeTabs(user.role)} />
      ) : null}

      <CollectionsNav canVerify={can(user.role, "payment.verify")} />

      <div className="mb-4 overflow-hidden rounded-xl border bg-card shadow-soft">
        {/*
          Filtering, made to look like filtering.

          It was a second row of pills directly under the navigation pills —
          same shape, same size, same place — so the eye could not tell which
          row moved between pages and which narrowed the list. These are a
          segmented control now, joined into one block, sitting inside the card
          they act on rather than floating above it.

          Nine of them since credit arrived, so the control scrolls inside its own
          strip rather than wrapping into a second row of half-segments — and the
          caption that used to sit beside it is gone, because it repeated the page
          description word for word one line below it.
        */}
        {/*
          Search sits with the filters, not above them.

          The chips narrow by STATE and this narrows by WHO — two halves of the
          same question, and a desk with a customer on the phone reaches for the
          name first. It keeps whichever chip is active, and the chips keep it,
          so neither control silently undoes the other.
        */}
        {/*
          Search that shows what it can find while you type.

          Typing blind and pressing Search is a guess — you learn whether the
          spelling was right only after the page reloads. The suggestions are
          this page's own rows, so they are instant and can never disagree with
          the list underneath.
        */}
        <div className="border-b px-4 py-3">
          <SearchBox
            defaultValue={query}
            placeholder={t(locale, "Customer, tracking number, invoice or phone…")}
            suggestions={rows.flatMap((row) => [
              {
                value: row.customerName ?? "",
                label: row.customerName ?? "",
                hint: row.customerPhone ?? undefined,
              },
              {
                value: row.trackingNumber ?? "",
                label: row.description || row.trackingNumber || "",
                hint: row.trackingNumber ?? undefined,
              },
              ...(row.invoiceNumber
                ? [
                    {
                      value: row.invoiceNumber,
                      label: row.customerName,
                      hint: row.invoiceNumber,
                    },
                  ]
                : []),
            ])}
          >
            <input type="hidden" name="filter" value={active} />
          </SearchBox>
          {query ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {visible.length} {t(locale, "of")} {rows.length} {t(locale, "match")}
              {" · "}
              <Link
                href={`/app/collections/follow-up?filter=${active}`}
                className="underline-offset-2 hover:underline"
              >
                {t(locale, "Clear")}
              </Link>
            </p>
          ) : null}
        </div>

        {/* Scrolls sideways inside the card, the way the filter strip below it
            does. The four segments are 392px wide and cannot shrink, and a row
            cannot wrap a single child — so on a phone the last of them, "Most
            urgent", was clipped off the card and could never be pressed. */}
        <div className="flex items-center gap-3 overflow-x-auto border-b px-4 py-3">
        {/* How it is ordered, said out loud and changeable. The list has always
            been ranked by urgency and never said so, which on a day when every
            consignment landed together reads as no order at all. */}
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border">
          {FOLLOW_UP_SORTS.map((option) => {
            const isActive = option.key === order;
            return (
              <Link
                key={option.key}
                href={`/app/collections/follow-up?filter=${active}&sort=${option.key}${
                  query ? `&q=${encodeURIComponent(query)}` : ""
                }`}
                className={`inline-flex shrink-0 items-center whitespace-nowrap border-r px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0 ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(locale, option.label)}
              </Link>
            );
          })}
        </div>
        </div>

        <div className="overflow-x-auto border-b px-4 py-3">
        <div className="inline-flex overflow-hidden rounded-lg border">
          {FOLLOW_UP_FILTERS.map((option) => {
            const count = rows.filter((row) => matchesFilter(row, option.key)).length;
            const isActive = option.key === active;
            return (
              <Link
                key={option.key}
                href={`/app/collections/follow-up?filter=${option.key}&sort=${order}${
                  query ? `&q=${encodeURIComponent(query)}` : ""
                }`}
                title={t(locale, option.hint)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-r px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0 ${
                  isActive
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(locale, option.label)}
                <span
                  className={`tabular-nums ${isActive ? "opacity-80" : "opacity-60"}`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
        </div>
        {/*
          FOUR FIGURES, then everything else on one line.

          Nine equal cells gave "Cash owed" and "Verified today" the same weight —
          one is the reason this page exists, the other a tally somebody glances
          at once a day. A strip where nothing is bigger than anything else has to
          be read in full to find the number you came for.

          So the four that decide what happens next take the size, and the rest
          become a sentence underneath. Still one band and still no tall cards —
          the density asked for, with an order to it.
        */}
        <div className="border-b px-4 py-3">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { k: t(locale, "Cash owed"), v: money(totals.cashUsd), sub: inUsd(totals.cashUsd), tone: "text-signal" },
              { k: t(locale, "Credit owed"), v: money(totals.creditUsd), sub: inUsd(totals.creditUsd), tone: "text-brand" },
              {
                k: t(locale, "Overdue"),
                v: money(totals.overdueUsd),
                sub: inUsd(totals.overdueUsd),
                tone: totals.overdueUsd > 0 ? "text-destructive" : "text-muted-foreground",
              },
              { k: t(locale, "Storage so far"), v: money(totals.storageUsd), sub: inUsd(totals.storageUsd), tone: "text-foreground" },
            ].map((cell) => (
              <div key={cell.k} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {cell.k}
                </dt>
                <dd
                  className={cn(
                    "font-display font-bold leading-tight tabular-nums",
                    String(cell.v).length <= 11 ? "text-2xl" : String(cell.v).length <= 14 ? "text-xl" : "text-lg",
                    cell.tone
                  )}
                >
                  {cell.v}
                </dd>
                {cell.sub ? (
                  <dd className="text-[11px] tabular-nums text-muted-foreground">
                    {cell.sub}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>

          {/* The tallies, as a sentence: numbers somebody checks rather than acts
              on — with the two things the figures above would otherwise be read
              wrongly. Storage is inside the bill already, and a credit inside its
              terms is not a debt anybody is late on. */}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{totals.count}</span>{" "}
              {t(locale, "on this list")}
            </span>
            <span>
              {t(locale, "Due today")}{" "}
              <span className="font-semibold text-foreground">{money(totals.dueTodayUsd)}</span>
            </span>
            <span>
              {t(locale, "Due this week")}{" "}
              <span className="font-semibold text-foreground">{money(totals.dueWeekUsd)}</span>
            </span>
            <span>{t(locale, "Storage is already inside the bill, not on top of it.")}</span>
            {totals.insideTermsCount > 0 ? (
              <span>
                {totals.insideTermsCount}{" "}
                {t(locale, "credit(s) here are inside their terms — visible, not to be chased.")}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">{t(locale, "Customer")}</th>
              <th className="p-3 font-medium">{t(locale, "Cargo")}</th>
              {/* "In warehouse" before. A credit's cargo has gone home with the
                  customer, and the clock that matters on it is the age of the
                  debt — one column, two things standing, one honest word. */}
              <th className="hidden p-3 font-medium lg:table-cell">
                {t(locale, "Waiting")}
              </th>
              <th className="p-3 font-medium">{t(locale, "Owed")}</th>
              <th className="p-3 font-medium">{t(locale, "Next action")}</th>
              <th className="p-3 text-right font-medium">
                {t(locale, "Reach them")}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                id={row.trackingNumber ?? undefined}
                className="border-t align-top"
              >
                <td className="p-3">
                  <Link
                    href={`/app/customers/${row.customerId}`}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {row.customerName}
                  </Link>
                  {/*
                    The badge that stops the wrong phone call.

                    A credit row and an unpaid cash row are the same shape, and
                    without this the desk cannot tell that the second one is a
                    customer who has not paid and the first is a customer who
                    does not have to yet. Red only once the granted date has
                    passed; until then it is deliberately quiet, and it names the
                    terms so nobody has to open the bill to learn them.
                  */}
                  {row.credit ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-2 align-middle",
                        row.credit.daysOverdue > 0
                          ? "border-destructive/40 text-destructive"
                          : "border-brand/40 text-brand"
                      )}
                    >
                      {row.credit.termDays
                        ? `${row.credit.termDays}${t(locale, "d credit")}`
                        : t(locale, "credit")}
                    </Badge>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    {row.customerPhone ?? t(locale, "no phone on file")}
                  </div>
                </td>
                <td className="p-3">
                  {row.trackingNumber ? (
                    <Link
                      href={`/app/cargo/${row.trackingNumber}`}
                      className="font-mono text-xs hover:text-brand hover:underline"
                    >
                      {row.trackingNumber}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">—</span>
                  )}
                  {/* Only when there is something to say. A credit row knows the
                      money and the dates, not what is in the boxes, and a line
                      per row reporting that absence is a line the reader learns
                      to skip. */}
                  {row.description || row.credit?.batchNumber ? (
                    <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
                      {row.description || row.credit?.batchNumber}
                    </div>
                  ) : null}
                </td>
                <td className="hidden p-3 lg:table-cell">
                  {/* Days on our floor for cash; days the debt has been standing
                      for a credit, whose cargo left with the customer. */}
                  {row.credit ? (
                    <span className="tabular-nums text-muted-foreground">
                      {row.credit.daysOnCredit}
                      {t(locale, "d on credit")}
                    </span>
                  ) : (
                    <span className="tabular-nums">{row.daysInWarehouse}d</span>
                  )}
                  {/*
                    How late they are, not what it costs.

                    This badge carried a running shilling figure, which put a
                    price on every row of a list whose whole job is deciding who
                    to ring. The number that decides that is the DELAY — somebody
                    eleven days late gets a different call from somebody one day
                    late — and the money is worked out when they come in to pay.
                  */}
                  {row.storageDays > 0 ? (
                    <Badge
                      variant="outline"
                      className="ml-2 border-destructive/40 text-destructive"
                    >
                      {row.storageDays}
                      {t(locale, row.storageDays === 1 ? "d late" : "d late")}
                    </Badge>
                  ) : null}
                </td>
                <td className="p-3 font-mono tabular-nums">
                  {row.outstanding === null ? (
                    <span className="text-muted-foreground">
                      {t(locale, "not billed")}
                    </span>
                  ) : row.outstanding <= 0 ? (
                    <span className="text-success">{t(locale, "paid")}</span>
                  ) : (
                    <>
                      {/* What the customer will actually send, first — at the
                          invoice's own frozen rate, never today's, because this
                          is the figure they were quoted. Written by formatLocal
                          so it says "TSh" like the rest of the app; spelled out
                          here it said "TZS", which made the same amount look
                          like two currencies between this list and the bill. */}
                      <div className="font-semibold">
                        {row.outstandingLocal !== null
                          ? formatLocal(
                              row.outstandingLocal,
                              row.localCurrency ?? undefined
                            )
                          : money(row.outstanding)}
                      </div>
                      {/* The exact dollar figure underneath, whichever rate did
                          the converting above — dropped only when no rate is
                          published at all and the line above is already
                          dollars. */}
                      {row.outstandingLocal !== null || liveRate !== null ? (
                        <div className="text-xs text-muted-foreground">
                          {formatUsd(row.outstanding)}
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="p-3">
                  {/* Loud only when it is actually a chase. An overdue credit is
                      red like a late bill; a credit still inside the terms the
                      company granted is muted, because the instruction on it is
                      to leave the customer alone. */}
                  <span
                    className={cn(
                      "font-medium",
                      row.credit === null
                        ? ""
                        : row.credit.daysOverdue > 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    )}
                  >
                    {t(locale, row.nextAction)}
                  </span>
                  {/* The engine's own due wording, and the date it falls on —
                      the two things a customer argues about on the phone. */}
                  {row.credit ? (
                    <div className="text-xs text-muted-foreground">
                      {t(locale, row.credit.dueText)}
                      {row.credit.dueDate
                        ? ` · ${formatDate(row.credit.dueDate, locale)}`
                        : ""}
                      {row.credit.state === "PARTIALLY_PAID"
                        ? ` · ${t(locale, row.credit.stateLabel)}`
                        : ""}
                    </div>
                  ) : null}
                  {row.invoiceId ? (
                    <div className="mt-0.5">
                      <Link
                        href={`/app/finance/invoices/${row.invoiceId}`}
                        className="font-mono text-xs text-brand hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </div>
                  ) : row.trackingNumber ? (
                    <div className="mt-0.5">
                      <Link
                        href={`/app/cargo/${row.trackingNumber}`}
                        className="text-xs text-brand hover:underline"
                      >
                        {t(locale, "Open cargo")}
                      </Link>
                    </div>
                  ) : null}
                </td>
                <td className="p-3">
                  {/* One icon per thing you can do, all the same size, each
                      carrying its own colour so the hand can find it without
                      reading: green message, blue money, violet download, amber
                      bill. Deliberately not `info` for any of them — it is 205°
                      against brand's 213° and the two read as one colour at
                      14px.
                      "Send invoice" and "Remind" both opened WhatsApp with the
                      identical message — one action wearing two buttons, and
                      the row was wide enough to make you read both before
                      picking. Sending is not a step any more either: invoices
                      are generated, so the only message this desk sends is a
                      reminder, and there is one button for it. */}
                  <div className="flex items-center justify-end gap-1.5">
                    {/*
                      THE WHOLE CONSIGNMENT, FIRST.

                      Everything else on this row acts on one thing — send a
                      reminder, take a payment, hand over the bill. This opens
                      the page that has all of it: the boxes, the photos, the
                      storage clock, the packages checked in, and the payment
                      form with the balance already in it. The tracking number
                      was already a link and nobody found it, because a link
                      that looks like text is not a door.
                    */}
                    {row.trackingNumber ? (
                      <IconHint label={t(locale, "Open the cargo")}>
                        <Link
                          href={`/app/cargo/${row.trackingNumber}`}
                          aria-label={`${t(locale, "Open")} ${row.trackingNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand/40 text-brand transition-colors hover:bg-brand/10"
                        >
                          <PackageOpen className="h-3.5 w-3.5" />
                        </Link>
                      </IconHint>
                    ) : null}

                    {row.customerPhone ? (
                      <IconHint
                        label={
                          row.credit
                            ? t(locale, "Notify on WhatsApp")
                            : t(locale, "Notify on WhatsApp")
                        }
                      >
                      <a
                        href={whatsappLink(
                          row.customerPhone,
                          row.credit
                            ? creditMessage(row)
                            : row.invoiceId
                              ? invoiceMessage(row)
                              : `Habari ${row.customerName.split(" ")[0]}, kuhusu mzigo wako ${row.trackingNumber}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`WhatsApp ${row.customerName}`}
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-success/40 text-success transition-colors hover:bg-success/10"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                      </IconHint>
                    ) : null}

                    {(canRecord || canCollect) &&
                    row.invoiceId &&
                    row.invoiceStatus !== "DRAFT" &&
                    row.outstanding !== null &&
                    row.outstanding > 0 ? (
                      <IconHint label={t(locale, "Record a payment")}>
                        {/*
                          THE FORM OPENS HERE, IT DOES NOT SEND YOU AWAY.

                          This was a link: Finance to the cargo page to hunt
                          for the panel, Support to a page of its own. Both
                          meant leaving the call list — the screen a desk works
                          down with a customer on the phone — and finding the
                          way back to the row they were on. Opening the cargo
                          already has its own icon two along; this one takes
                          the money, the way the credit dialog beside it grants
                          the terms.
                        */}
                        <RecordPaymentDialog
                          invoiceId={row.invoiceId}
                          invoiceNumber={row.invoiceNumber ?? ""}
                          customerName={row.customerName}
                          trackingNumber={row.trackingNumber ?? ""}
                          goods={row.description}
                          outstanding={row.outstanding}
                          currency={row.currency ?? "USD"}
                          rate={row.exchangeRate}
                          banks={payAccounts}
                          canRecord={canRecord}
                          canDiscount={can(user.role, "invoice.discount")}
                          canChangeRate={can(user.role, "invoice.rate")}
                          invoiceDiscount={row.invoiceDiscount}
                          invoiceTotal={row.total ?? undefined}
                          storage={row.invoiceStorage}
                          storageUncharged={row.invoiceStorageUncharged}
                          storageFreeDaysLeft={row.invoiceStorageFreeDays}
                          canWaiveStorage={can(user.role, "invoice.storage.waive")}
                          label={`${t(locale, "Record a payment for")} ${row.invoiceNumber ?? row.trackingNumber}`}
                        />
                      </IconHint>
                    ) : null}

                    {/*
                      Credit, from whichever end this desk works it.

                      A customer on the phone asking for time is the commonest
                      thing that happens on this list, and there was nothing on
                      the row to answer it with — the desk had to leave, find
                      the cargo and start again. Two different jobs behind one
                      icon: a bill with no terms on it yet is a request to
                      raise, and a bill already on terms is an arrangement to
                      look at.

                      Support sees both and can only ask. Finance sees both and
                      is the one who decides, which is why its label says so.
                    */}
                    {row.credit === null ? (
                      canAskForCredit &&
                      row.invoiceId &&
                      row.invoiceStatus !== "DRAFT" &&
                      row.outstanding !== null &&
                      row.outstanding > 0 ? (
                        /* Straight to the ask. It used to open the invoice,
                           where you pressed "Ask for credit" a second time —
                           a step that existed only because two screens met. */
                        <CreditOnRow
                          invoiceId={row.invoiceId}
                          canApprove={canDecideCredit}
                          label={
                            canDecideCredit
                              ? t(locale, "Release on credit")
                              : t(locale, "Ask for credit")
                          }
                        />
                      ) : null
                    ) : (
                      <IconHint
                        label={
                          canDecideCredit
                            ? t(locale, "Decide the credit")
                            : t(locale, "See the credit terms")
                        }
                      >
                        <Link
                          /* Straight to this customer's line in the credit
                             book rather than the whole book — the desk is
                             looking at one row and wants the same one. */
                          href={`/app/finance/credit?q=${encodeURIComponent(row.customerName)}`}
                          aria-label={`${t(locale, "Credit for")} ${row.customerName}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-chart-4/40 text-chart-4 transition-colors hover:bg-chart-4/10"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                        </Link>
                      </IconHint>
                    )}

                    {/* The bill itself: hand it over, or open it to change
                        something before the customer is asked to pay. */}
                    {row.invoiceNumber ? (
                      <>
                        <IconHint label={t(locale, "Download the invoice")}>
                        <a
                          href={`/app/finance/invoices/${row.invoiceNumber}/pdf`}
                          aria-label={`${t(locale, "Download")} ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-chart-6/40 text-chart-6 transition-colors hover:bg-chart-6/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        </IconHint>
                        <IconHint label={t(locale, "Open the invoice")}>
                        <Link
                          href={`/app/finance/invoices/${row.invoiceId}`}
                          aria-label={`${t(locale, "Open")} ${row.invoiceNumber}`}
                          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-warning/40 text-warning transition-colors hover:bg-warning/10"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                        </IconHint>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  {t(locale, "Nothing in this queue. Nothing to chase.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Only when there is more than one. A pager on a single page of results
          is a control that answers a question nobody asked. */}
      {pageCount > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="text-muted-foreground">
            {t(locale, "Showing")}{" "}
            <span className="font-mono tabular-nums">
              {(current - 1) * PAGE_SIZE + 1}–
              {Math.min(current * PAGE_SIZE, ordered.length)}
            </span>{" "}
            {t(locale, "of")}{" "}
            <span className="font-mono tabular-nums">{ordered.length}</span>
          </p>
          <div className="inline-flex overflow-hidden rounded-lg border">
            {current > 1 ? (
              <Link
                href={pageHref(current - 1)}
                className="focus-ring border-r px-3 py-1.5 font-medium transition-colors hover:bg-accent"
              >
                {t(locale, "Previous")}
              </Link>
            ) : null}
            <span className="border-r px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
              {current} / {pageCount}
            </span>
            {current < pageCount ? (
              <Link
                href={pageHref(current + 1)}
                className="focus-ring px-3 py-1.5 font-medium transition-colors hover:bg-accent"
              >
                {t(locale, "Next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
