import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activeAccounts } from "@/lib/accounts";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
} from "@/lib/expenses";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Transaction review") };
}

/* The register's own vocabulary (app/app/finance/transactions). The words are
   repeated here rather than invented afresh: when the manager rings Finance
   about a row, both screens must be calling it the same thing. */
const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Freight payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

const PAGE_SIZE = 60;

/* Same windows as the register, for the same reason as KIND_LABEL. */
function windowStart(period: string | undefined): Date | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

/**
 * The manager's read of what Finance has recorded.
 *
 * Not a second ledger. Every row here is a LedgerEntry — the same rows, the
 * same filters and the same words as the register Finance works from — read
 * for a different question: not "where is the money" but "is this record
 * right". So there is no running balance and no in/out totals; those belong to
 * the register, and a manager totalling money on a review screen is auditing
 * arithmetic the ledger already did.
 *
 * What a row carries instead is everything needed to judge it without opening
 * it: who paid or was paid, against which invoice or batch, by what method,
 * into which account, recorded by whom, with the supporting document one click
 * away. Judgement itself is append-only ManagerReview rows kept BESIDE the
 * record — disputing a payment never edits the payment.
 */
export default async function TransactionReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    account?: string;
    direction?: string;
    kind?: string;
    person?: string;
    period?: string;
    page?: string;
  }>;
}) {
  await requirePermission("ledger.view");
  const locale = await viewerLocale();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.LedgerEntryWhereInput = {};
  if (params.account) where.accountId = params.account;
  if (params.direction === "IN" || params.direction === "OUT") {
    where.direction = params.direction;
  }
  if (params.kind && params.kind in KIND_LABEL) {
    where.kind = params.kind as Prisma.LedgerEntryWhereInput["kind"];
  }
  if (params.person) where.recordedById = params.person;
  const from = windowStart(params.period);
  if (from) where.occurredAt = { gte: from };

  /* The register's search, verbatim: whatever Finance can find, the reviewer
     can find by the same half-remembered code. */
  const q = params.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { description: like },
      { entryNumber: like },
      { account: { name: like } },
      { recordedBy: { name: like } },
      { payment: { reference: like } },
      { payment: { note: like } },
      { payment: { receipt: { receiptNumber: like } } },
      { payment: { receivedBy: { name: like } } },
      { payment: { invoice: { invoiceNumber: like } } },
      { payment: { invoice: { customer: { name: like } } } },
      { payment: { invoice: { customer: { phone: like } } } },
      { payment: { invoice: { shipment: { trackingNumber: like } } } },
      { payment: { invoice: { shipment: { description: like } } } },
      { expense: { expenseNumber: like } },
      { expense: { description: like } },
      { expense: { vendor: like } },
      { expense: { batch: { batchNumber: like } } },
      { transfer: { transferNumber: like } },
      { transfer: { reason: like } },
      { transfer: { fromAccount: { name: like } } },
      { transfer: { toAccount: { name: like } } },
    ];
  }

  const [accounts, people, entries, total] = await Promise.all([
    activeAccounts(),
    prisma.user.findMany({
      where: { ledgerEntries: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        account: { select: { id: true, name: true } },
        recordedBy: { select: { name: true } },
        payment: {
          select: {
            id: true,
            method: true,
            reference: true,
            voidedAt: true,
            receipt: { select: { receiptNumber: true } },
            proofs: { select: { url: true }, take: 1 },
            invoice: {
              select: {
                invoiceNumber: true,
                creditStatus: true,
                customer: { select: { name: true } },
                shipment: { select: { trackingNumber: true } },
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
            receipts: { select: { url: true }, take: 1 },
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
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* The register's classification, unchanged — the difference between a cash
     sale and a debt being settled matters at least as much to the person
     checking the record as to the person who typed it. */
  const typeOf = (entry: (typeof entries)[number]) => {
    if (entry.reversesId) return t(locale, "Correction");
    if (entry.expense) {
      return t(
        locale,
        EXPENSE_CATEGORY_LABELS[entry.expense.category] ??
          entry.expense.category
      );
    }
    if (entry.payment) {
      return entry.payment.invoice.creditStatus === "APPROVED"
        ? t(locale, "Credit payment")
        : t(locale, "Cash sale");
    }
    if (entry.transfer) return t(locale, "Between accounts");
    return t(locale, KIND_LABEL[entry.kind] ?? entry.kind);
  };

  /* What state the underlying record is in — not to be confused with the
     manager's verdict on it. A voided payment or a cancelled cost is dead on
     the record's own terms; "Posted" is every line whose record simply stands. */
  const statusOf = (entry: (typeof entries)[number]) => {
    if (entry.payment?.voidedAt) {
      return { label: t(locale, "Voided"), tone: "text-destructive" };
    }
    if (entry.expense) {
      return {
        label: t(
          locale,
          EXPENSE_STATUS_LABELS[entry.expense.status] ?? entry.expense.status
        ),
        tone:
          entry.expense.status === "VOID"
            ? "text-destructive"
            : "text-muted-foreground",
      };
    }
    if (entry.reversesId) {
      return { label: t(locale, "Correction"), tone: "text-warning" };
    }
    return { label: t(locale, "Posted"), tone: "text-muted-foreground" };
  };

  const pageLink = (nextPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, String(value));
    }
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return qs
      ? `/app/manager/transactions?${qs}`
      : "/app/manager/transactions";
  };

  return (
    <>
      <PageHeader
        title={t(locale, "Transaction review")}
        description={t(
          locale,
          "Everything Finance has recorded — payments in, costs out — on the same rows Finance sees, with the evidence beside each one."
        )}
      />

      {/* A GET form rather than a client filter bar: the six axes land in the
          URL, so a filtered view can be sent to Finance as a link — "look at
          Thursday's cash payments" — and it survives a refresh mid-review. */}
      <form
        action="/app/manager/transactions"
        className="mb-4 flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t(
            locale,
            "Customer, invoice, receipt, reference, vendor, batch…"
          )}
          aria-label={t(locale, "Search the records")}
          className="h-9 text-sm sm:min-w-[16rem] sm:flex-1"
        />
        <NativeSelect
          name="kind"
          defaultValue={params.kind ?? ""}
          aria-label={t(locale, "Type")}
          className="h-9 text-sm sm:w-40"
        >
          <option value="">{t(locale, "All types")}</option>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {t(locale, label)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="direction"
          defaultValue={params.direction ?? ""}
          aria-label={t(locale, "Direction")}
          className="h-9 text-sm sm:w-32"
        >
          <option value="">{t(locale, "In & out")}</option>
          <option value="IN">{t(locale, "In only")}</option>
          <option value="OUT">{t(locale, "Out only")}</option>
        </NativeSelect>
        <NativeSelect
          name="account"
          defaultValue={params.account ?? ""}
          aria-label={t(locale, "Account")}
          className="h-9 text-sm sm:w-44"
        >
          <option value="">{t(locale, "All accounts")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="person"
          defaultValue={params.person ?? ""}
          aria-label={t(locale, "Recorded by")}
          className="h-9 text-sm sm:w-36"
        >
          <option value="">{t(locale, "Anyone")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="period"
          defaultValue={params.period ?? ""}
          aria-label={t(locale, "When")}
          className="h-9 text-sm sm:w-32"
        >
          <option value="">{t(locale, "Any date")}</option>
          <option value="today">{t(locale, "Today")}</option>
          <option value="week">{t(locale, "This week")}</option>
          <option value="month">{t(locale, "This month")}</option>
          <option value="year">{t(locale, "This year")}</option>
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {t(locale, "Filter")}
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState
          title={
            q
              ? `${t(locale, "Nothing matches")} “${q}”`
              : t(locale, "Nothing recorded yet")
          }
          description={
            q
              ? t(locale, "Try a shorter search, or clear the filters.")
              : t(
                  locale,
                  "Every payment, cost and transfer Finance records appears here for review."
                )
          }
        />
      ) : (
        /* One table at every width, scrolling sideways on a phone. A record is
           judged across its whole row — the method against the account, the
           document against the amount — and stacking those facts vertically
           separates exactly the things a reviewer reads side by side. */
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Date")}</TableHead>
                <TableHead>{t(locale, "Record")}</TableHead>
                <TableHead>{t(locale, "Type")}</TableHead>
                <TableHead>{t(locale, "Account")}</TableHead>
                <TableHead>{t(locale, "Method")}</TableHead>
                <TableHead>{t(locale, "By")}</TableHead>
                <TableHead className="text-right">
                  {t(locale, "Amount")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Doc")}</TableHead>
                <TableHead>{t(locale, "Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const inbound = entry.direction === "IN";
                const amount = formatMoney(
                  toNumber(entry.amount),
                  entry.currency
                );
                const proof =
                  entry.payment?.proofs[0]?.url ??
                  entry.expense?.receipts[0]?.url ??
                  null;
                const status = statusOf(entry);

                /* Who the line is about, then every code that ties it to paper:
                   invoice, batch, receipt or expense number, tracking,
                   reference. The codes are what the reviewer quotes back at
                   Finance, so they are all here even where the title repeats
                   one. */
                let title = entry.description;
                let aside: string | null = null;
                if (entry.payment) {
                  title = entry.payment.invoice.customer.name;
                } else if (entry.expense) {
                  title = entry.expense.description;
                  aside = entry.expense.vendor
                    ? `${t(locale, "paid to")} ${entry.expense.vendor}`
                    : null;
                } else if (entry.transfer) {
                  title = inbound
                    ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                    : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`;
                  aside = entry.transfer.reason;
                }

                const refs = [
                  entry.payment?.invoice.invoiceNumber,
                  entry.expense?.batch?.batchNumber,
                  entry.payment?.receipt?.receiptNumber ??
                    entry.expense?.expenseNumber ??
                    entry.transfer?.transferNumber ??
                    entry.entryNumber,
                  entry.payment?.invoice.shipment.trackingNumber,
                  entry.payment?.reference,
                ].filter((v): v is string => Boolean(v));

                return (
                  <TableRow key={entry.id} className="align-top">
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {formatDate(entry.occurredAt, locale)}
                    </TableCell>

                    <TableCell className="min-w-[15rem] max-w-[24rem] py-2.5">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {aside ? <>{aside} </> : null}
                        {refs.map((ref, i) => (
                          <span key={ref}>
                            {i > 0 || aside ? "· " : null}
                            <span className="whitespace-nowrap font-mono text-muted-foreground/70">
                              {ref}
                            </span>{" "}
                          </span>
                        ))}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-xs">
                      {typeOf(entry)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs">
                      {entry.account.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {entry.payment
                        ? t(locale, PAYMENT_METHOD_LABELS[entry.payment.method])
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {entry.recordedBy?.name ?? "—"}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      <span
                        className={inbound ? "text-success" : "text-destructive"}
                      >
                        {inbound ? "+" : "−"}
                        {amount}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right text-xs">
                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t(locale, "View")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell
                      className={`whitespace-nowrap py-2.5 text-xs ${status.tone}`}
                    >
                      {status.label}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages} ·{" "}
            {total.toLocaleString("en-US")}{" "}
            {t(locale, total === 1 ? "record" : "records")}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageLink(page - 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={pageLink(page + 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
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
