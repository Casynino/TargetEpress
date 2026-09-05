import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { ChevronRight, Layers, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { LedgerFilters } from "@/components/app/ledger-filters";
import { AskForCredit } from "@/components/app/ask-for-credit";
import { RecordCostButton } from "@/components/app/record-cost-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activeAccounts } from "@/lib/accounts";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { RecordIncome } from "@/components/app/record-income";
import { creditNotInTheLedger } from "@/lib/credit-queries";
import {
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "The Ledger") };
}

const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Freight payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
  /* Money that arrived with a customer's payment and was never the company's:
     the delivery, on its way to whoever drives. Named rather than left as the
     raw enum, because it appears on the register beside real income and must
     not read as either an expense or a payment. */
  TRANSPORT_OUT: "Transport paid out",
};

const PAGE_SIZE = 60;

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
 * The general ledger: one register for every movement of money.
 *
 * This replaces three pages. Payments-in listed the money coming in, Expenses
 * listed the money going out, and Money-in-and-out listed both again — three
 * readings of one fact, each with its own totals that somebody then had to
 * reconcile in their head. Income here comes from one place, freight, and it
 * goes out on running the business. A single register says that, once.
 *
 * Debit and credit are separate columns because that is how a ledger is read:
 * the eye runs down one column for what left and the other for what came in.
 * The running balance is why the register is worth keeping — it can be read
 * straight down against a bank statement.
 *
 * Recording a cost lives here too. The place you watch money leave is the place
 * you write down money leaving.
 */
/*
  EVERY CONSIGNMENT A PAYMENT ANSWERED.

  A merged payment is one transaction settling several bills at once, and the
  row named only the bill it is anchored to — so TSh 145,125 across two boxes
  read as though it were for one, which is the opposite of what a combined
  payment exists to show. The allocations are where the truth is; the anchor is
  just the first of them. A single payment has one allocation and so reads
  exactly as it always did.
*/
function cargoRefsOf(
  // Null on every line that is not a payment — an expense, a transfer.
  payment: {
    invoice?: { shipment: { trackingNumber: string } } | null;
    allocations?: { invoice: { shipment: { trackingNumber: string } | null } }[];
  } | null
): string[] {
  const covered = (payment?.allocations ?? [])
    .map((a) => a.invoice.shipment?.trackingNumber)
    .filter((v): v is string => Boolean(v));
  if (covered.length > 0) return covered;
  const anchor = payment?.invoice?.shipment.trackingNumber;
  return anchor ? [anchor] : [];
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    account?: string;
    direction?: string;
    kind?: string;
    category?: string;
    person?: string;
    period?: string;
    page?: string;
    /** ?income=1 opens the income panel on arrival, for Home's shortcut. */
    income?: string;
  }>;
}) {
  const user = await requirePermission("ledger.view");
  /* Correcting the register: Finance and the owner, per ledger.adjust. */
  const canFix = can(user.role, "ledger.adjust");
  const locale = await viewerLocale();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const canRecord = can(user.role, "expense.record");
  /* Money in is a different permission from money out: the desk that records
     costs is not automatically the desk that takes customers' payments. */
  const canTakeMoney = can(user.role, "payment.record");
  /* The other two money doors this page was missing: a combined payment, and
     letting a consignment go on terms. */
  const canAskForCredit = can(user.role, "credit.request");
  const canDecideCredit = can(user.role, "credit.approve");

  /*
    THE REVERSING LINE IS THE MECHANISM, NOT A MOVEMENT.

    Cancelling a payment leaves the original line and posts one going the other
    way — that is how an append-only register undoes something, and the row
    stays in the database for ever. But the register on screen already tells
    the story on the ORIGINAL row: struck through, marked Cancelled, with who
    did it and why. Listing the answering line as well says the same thing
    twice and reads like a second transaction that never happened, which is
    exactly how somebody comes to believe money moved.

    So the list shows the cancelled line and not its answer. Nothing is lost:
    both rows are still in the database, the entry's own page shows the pair,
    and the audit log carries the cancellation with its reason.
  */
  const where: Prisma.LedgerEntryWhereInput = { reversesId: null };
  if (params.account) where.accountId = params.account;
  if (params.direction === "IN" || params.direction === "OUT") {
    where.direction = params.direction;
  }
  if (params.kind && params.kind in KIND_LABEL) {
    where.kind = params.kind as Prisma.LedgerEntryWhereInput["kind"];
  }
  if (params.person) where.recordedById = params.person;
  if (params.category) {
    where.expense = { category: params.category as never };
  }
  const from = windowStart(params.period);
  if (from) where.occurredAt = { gte: from };

  // One box for anything somebody half-remembers.
  //
  // Nobody looking for a payment remembers which field the thing they remember
  // lives in. They remember the customer, or the tracking number off the label,
  // or the M-Pesa code on the message, or roughly what the cargo was. Every one
  // of those reaches the same line, so there is nothing to know before typing.
  const q = params.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    where.OR = [
      // The line itself
      { description: like },
      { entryNumber: like },
      { account: { name: like } },
      { recordedBy: { name: like } },
      // Freight coming in — receipt, reference, customer, cargo
      { payment: { reference: like } },
      { payment: { note: like } },
      { payment: { receipt: { receiptNumber: like } } },
      { payment: { receivedBy: { name: like } } },
      { payment: { invoice: { invoiceNumber: like } } },
      { payment: { invoice: { customer: { name: like } } } },
      { payment: { invoice: { customer: { phone: like } } } },
      { payment: { invoice: { shipment: { trackingNumber: like } } } },
      { payment: { invoice: { shipment: { description: like } } } },
      // Costs going out
      { expense: { expenseNumber: like } },
      { expense: { description: like } },
      { expense: { vendor: like } },
      { expense: { batch: { batchNumber: like } } },
      // Money moved between our own accounts
      { transfer: { transferNumber: like } },
      { transfer: { reason: like } },
      { transfer: { fromAccount: { name: like } } },
      { transfer: { toAccount: { name: like } } },
    ];
  }

  const [
    accounts,
    people,
    entries,
    total,
    totals,
    cancelledRows,
    rateRow,
    unpaid,
    unpaidByKind,
    credit,
  ] = await Promise.all([
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
          account: { select: { id: true, name: true, currency: true } },
          recordedBy: { select: { name: true } },
          payment: {
            select: {
              /*
                EVERY CONSIGNMENT THIS MONEY ANSWERED.

                A merged payment is one transaction covering several bills, and
                the row named only the anchor — so TSh 145,125 across two boxes
                read as though it were for one, which is the opposite of what a
                combined payment has to be able to show. The allocations are
                where the truth is; the anchor is just the first of them.
              */
              allocations: {
                select: {
                  invoice: {
                    select: {
                      invoiceNumber: true,
                      shipment: { select: { trackingNumber: true } },
                    },
                  },
                },
              },
              /* The register corrects and cancels in place now — see
                 LedgerRowFix — so it needs what those actions address. */
              id: true,
              note: true,
              reference: true,
              method: true,
              accountId: true,
              /* What the payment says now, and whether its figure can be
                 corrected here — see LedgerRowSubject. */
              amount: true,
              currency: true,
              invoiceId: true,
              /* One bill or several. A merged payment's figure cannot be
                 corrected here — see changePaymentAmount. */
              _count: { select: { allocations: true } },
              /* Who first took this money in, when it did not start at the
                 counter. A payment that came up from Customer Support was
                 recorded by Finance but collected by somebody else, and the
                 register credited only the second of the two — so the desk
                 that chased the customer disappeared from the record of it. */
              submission: {
                select: { submittedBy: { select: { name: true } } },
              },
              voidReason: true,
              voidedBy: { select: { name: true } },
              receipt: { select: { receiptNumber: true } },
              proofs: {
                select: { id: true, url: true, filename: true, contentType: true, bytes: true },
              },
              invoice: {
                select: {
                  /* So an income line can be corrected from here too. The edit
                     and the void both live on the bill's own page, where the
                     balance they change is on the screen beside them. */
                  invoiceNumber: true,
                  customer: { select: { name: true } },
                  /* Which side of §13 this line is on. A payment against a bill
                     that was released on credit is a debt being settled, not a
                     sale — same ledger kind, opposite meaning. */
                  creditStatus: true,
                  // What the customer actually shipped. This is the answer to
                  // "what was this payment for", and it was not being asked for.
                  shipment: {
                    select: {
                      trackingNumber: true,
                      ...selectText("description"),
                    },
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
              expenseClass: true,
              note: true,
              accountId: true,
              batchId: true,
              incurredAt: true,
              status: true,
              receipts: {
                select: { id: true, url: true, filename: true, contentType: true, bytes: true },
              },
            },
          },
          /* Whether this line has already been answered. */
          reversedBy: { select: { id: true } },
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
      /*
        THE TOTALS ARE THE TRUE POSITION, NOT A COUNT OF ROWS.

        A cancelled line and the line that cancels it are both real records and
        both belong in the list below — the register is append-only and that is
        the whole point of it. Neither is money that moved.

        Summed with everything else, cancelling an income of 54 ADDED 54 to
        Money out, because the reversal is an OUT line. The customer's 54 never
        left the building; it simply never arrived. So both halves of a
        reversed pair come out of these three figures, which makes cancelling
        an income reduce Money in, and cancelling a cost reduce Money out —
        each undoing itself rather than inventing a movement in the opposite
        direction.

        By currency as well as direction, because the two are summed
        differently — see the note where these are added up.
      */
      prisma.ledgerEntry.groupBy({
        by: ["direction", "currency"],
        where: { ...where, reversesId: null, reversedBy: { is: null } },
        _sum: { amount: true, amountUsd: true },
      }),
      /* How many of the rows below are cancelled, so the card can say why its
         count differs from the list it sits above. */
      prisma.ledgerEntry.count({
        where: { ...where, reversedBy: { isNot: null } },
      }),
      currentRate(),
      // Costs recorded but not yet disbursed have no ledger line, because no
      // money has moved. They still have to be visible somewhere.
      /* By currency, for the same reason the ledger totals are: a shilling cost
         is a shilling cost, and adding up its dollar snapshot instead loses
         money on the way back. */
      prisma.expense.groupBy({
        by: ["currency"],
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amount: true, amountUsd: true },
        _count: true,
      }),
      /* Broken down, because the total alone is a mystery. Thirty-four
         million against a handful of clearing costs looks wrong until you
         know it is payroll — so the line says which kind of cost it mostly
         is, and the reader stops having to guess. */
      prisma.expense.groupBy({
        by: ["category"],
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      /* Revenue this register cannot hold, for the same reason the unpaid costs
         above are not in it: no money has moved. Asked only of a desk allowed to
         read the credit book — ledger.view and credit.view happen to travel
         together today, and a figure never fetched cannot leak if they stop. */
      can(user.role, "credit.view")
        ? creditNotInTheLedger()
        : Promise.resolve(null),
    ]);

  /*
    A SECOND CORRECTION LOSES ITS DIRECT LINE TO THE EXPENSE.

    LedgerEntry.expenseId is unique — one line per cost, which is what makes
    "money cannot move without a ledger line" a database rule rather than a
    habit (see editExpense). The line a correction posts is a second line
    about the same cost, so it links only through sourceEntity/sourceId, and
    entry.expense — a relation keyed on expenseId — comes back null for it.
    Reading that as "not an expense" would make fixing a fix silently forget
    which cost it belongs to, so it is resolved by hand for exactly the rows
    where the direct relation missed.
  */
  const orphanedExpenseIds = entries
    .filter((e) => !e.expense && e.sourceEntity === "Expense" && e.sourceId)
    .map((e) => e.sourceId!);
  const fallbackExpenses = orphanedExpenseIds.length
    ? await prisma.expense.findMany({
        where: { id: { in: orphanedExpenseIds } },
        select: {
          id: true,
          expenseNumber: true,
          description: true,
          vendor: true,
          category: true,
          expenseClass: true,
          note: true,
          accountId: true,
          batchId: true,
          incurredAt: true,
          status: true,
          receipts: {
            select: { id: true, url: true, filename: true, contentType: true, bytes: true },
          },
        },
      })
    : [];
  const fallbackExpenseById = new Map(fallbackExpenses.map((e) => [e.id, e]));
  /** The expense behind a line, however it is linked to it. */
  const expenseFor = (entry: (typeof entries)[number]) =>
    entry.expense ??
    (entry.sourceEntity === "Expense" && entry.sourceId
      ? (fallbackExpenseById.get(entry.sourceId) ?? null)
      : null);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  /*
    SHILLING MONEY IS ADDED UP AS SHILLINGS.

    `amountUsd` is a Decimal(12,2) snapshot kept so movements in different
    currencies can be totalled against each other. It is not the money. Summing
    it and multiplying back by the rate loses a fraction of a cent per entry and
    then magnifies it by 2,700: two office-cash costs of TSh 20,000 and TSh
    40,000 were reported by the Dar desk as TSh 59,994, because 7.41 + 14.81 is
    22.22 and 22.22 x 2700 is not 60,000. The rows underneath were right the
    whole time — they read `amount` — so the register disagreed with its own
    total, which is the worst way for a figure to be wrong.

    Every entry carries the account's own currency in `amount`, exactly. So
    shillings are added as shillings and never leave the unit they were typed
    in; only genuinely foreign money goes through the USD snapshot, which is the
    one job that column exists for. The schema says as much: "balances never
    touch this".
  */
  const totalsFor = (dir: "IN" | "OUT") =>
    totals.filter((row) => row.direction === dir);
  const usdTotal = (dir: "IN" | "OUT") =>
    totalsFor(dir).reduce((sum, row) => sum + toNumber(row._sum.amountUsd ?? 0), 0);
  /** Exact for shilling money; foreign money converted at today's rate. */
  const tshTotal = (dir: "IN" | "OUT") =>
    totalsFor(dir).reduce(
      (sum, row) =>
        sum +
        (row.currency === "TZS"
          ? toNumber(row._sum.amount ?? 0)
          : toNumber(row._sum.amountUsd ?? 0) * (rate ?? 0)),
      0
    );

  /* The unpaid costs, added the same way: shillings as shillings. */
  const unpaidCount = unpaid.reduce((n, row) => n + row._count, 0);
  const unpaidUsd = unpaid.reduce(
    (sum, row) => sum + toNumber(row._sum.amountUsd ?? 0),
    0
  );
  const unpaidTsh = unpaid.reduce(
    (sum, row) =>
      sum +
      (row.currency === "TZS"
        ? toNumber(row._sum.amount ?? 0)
        : toNumber(row._sum.amountUsd ?? 0) * (rate ?? 0)),
    0
  );

  /* Kept for the no-rate fallback, where there is nothing to show but dollars. */
  const inUsd = usdTotal("IN");
  const outUsd = usdTotal("OUT");
  const inTsh = tshTotal("IN");
  const outTsh = tshTotal("OUT");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const single = accounts.find((a) => a.id === params.account) ?? null;

  // The running balance.
  //
  // Down one account it is that account's own currency. Across all of them it
  // has to be one unit or it is nonsense, so it accumulates in USD and is shown
  // in shillings — the same conversion every other figure here uses.
  const oldest = entries[entries.length - 1];
  let opening = 0;
  if (oldest) {
    /*
      ONE RANGE SCAN, NOT A TABLE SCAN.

      "Everything before this page" was expressed as `occurredAt < X OR
      (occurredAt = X AND createdAt < Y)`, and an OR across two columns cannot
      use @@index([occurredAt]) or @@index([accountId, occurredAt]) — so the
      opening balance re-aggregated the whole register on every page load, and
      the register only ever grows. The row comparison below says the same
      thing in the form the index is built for.
    */
    const account = params.account ?? null;
    const before = await prisma.$queryRaw<
      { direction: string; amount: number; amountUsd: number }[]
    >(Prisma.sql`
      SELECT e."direction",
             COALESCE(SUM(e."amount"), 0)::float8    AS "amount",
             COALESCE(SUM(e."amountUsd"), 0)::float8 AS "amountUsd"
        FROM "LedgerEntry" e
       WHERE ("occurredAt", "createdAt") < (${oldest.occurredAt}, ${oldest.createdAt})
         /* Same rule the rows below follow: a cancelled pair moved nothing, so
            neither half belongs in the balance this page opens on. */
         AND e."reversesId" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "LedgerEntry" r WHERE r."reversesId" = e."id"
         )
         ${account ? Prisma.sql`AND e."accountId" = ${account}` : Prisma.empty}
       GROUP BY e."direction"
    `);
    const pick = (dir: "IN" | "OUT") => {
      const row = before.find((r) => r.direction === dir);
      return single ? (row?.amount ?? 0) : (row?.amountUsd ?? 0);
    };
    opening = pick("IN") - pick("OUT");
  }

  const runningById = new Map<string, number>();
  let running = opening;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    /* A cancelled line moved no money, so it moves no balance: it carries the
       balance of the row beneath it and the column reads straight through.
       Its answering line is not in this list to bring the figure back down —
       skipping the pair is what keeps the running total honest without it. */
    if (entry.reversedBy) {
      runningById.set(entry.id, running);
      continue;
    }
    const value = single ? toNumber(entry.amount) : toNumber(entry.amountUsd);
    running += (entry.direction === "IN" ? 1 : -1) * value;
    runningById.set(entry.id, running);
  }

  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);
  /* For figures already worked out in shillings. Same shape as tsh() above so
     the tiles read the same, but nothing is multiplied a second time. */
  const shillings = (value: number, usdFallback: number) =>
    rate
      ? `TSh ${Math.round(value).toLocaleString("en-US")}`
      : formatUsd(usdFallback);
  const showBalance = (value: number) =>
    single ? formatMoney(value, single.currency) : tsh(value);

  /**
   * What KIND of transaction a line is, in the words the business uses.
   *
   * The interesting distinction is not in `kind` — it is inside
   * CUSTOMER_PAYMENT, and this column could not see it. Money handed over at the
   * counter for cargo is a SALE. Money handed over against a bill released on
   * credit three weeks ago is a debt being SETTLED: the sale already happened,
   * off this register, and reading it as a second sale would count the same
   * revenue twice in one month. Same kind, same account, opposite meaning, so
   * the answer comes from the invoice's credit status rather than from `kind`.
   *
   * §13 also names a REFUND type, and this schema has no such instrument. Money
   * genuinely going back to a customer is a cost — filed under Customer
   * compensation, the claim payout — and it already reads as that here. What is
   * NOT a refund is a reversing line, however much it looks like one: those come
   * from voiding a payment that should never have been recorded, the wrong
   * customer or the wrong bill or money that never cleared, so the figure comes
   * back out of the account it went into and usually nowhere near the customer.
   * Labelling that "Refund" would tell the reader the company paid somebody.
   * Either way this column said "Freight income" on it — money arriving, on the
   * row where it left.
   *
   * An expense keeps its category instead of the word "Expense". "Customs" is an
   * expense type and a more useful one, and the red debit column has already
   * said which way the money went.
   */
  const typeOf = (entry: (typeof entries)[number]) => {
    if (entry.reversesId) return t(locale, "Correction");
    if (entry.expense) {
      return t(
        locale,
        EXPENSE_CATEGORY_LABELS[entry.expense.category] ?? entry.expense.category
      );
    }
    if (entry.payment) {
      return entry.payment.invoice?.creditStatus === "APPROVED"
        ? t(locale, "Credit payment")
        : t(locale, "Cash sale");
    }
    if (entry.transfer) return t(locale, "Between accounts");
    return t(locale, KIND_LABEL[entry.kind] ?? entry.kind);
  };

  const pageLink = (nextPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, String(value));
    }
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return qs ? `/app/finance/transactions?${qs}` : "/app/finance/transactions";
  };

  return (
    <>
      <PageHeader
        title={t(locale, "The Ledger")}
        description={t(
          locale,
          "Every movement of money — freight collected, costs paid, transfers between accounts — with its account, who recorded it, and a running balance."
        )}
        actions={
          /*
            Every door money goes through, on the page money is read on.

            Payment, cost, merge and credit — the four things a money desk
            actually does — and they were split across three screens. One word
            each with its icon, because four full phrases wrapped this row onto
            a second line above the page's own title; the full names are on
            hover and inside each panel.
          */
          <div className="flex flex-wrap items-center gap-2">
            {canTakeMoney ? (
              <RecordIncome
                compact
                accounts={accounts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  currency: a.currency,
                  accountNumber: a.accountNumber,
                  /* Needed to tell a till from a bank: transport is settled
                     out of cash or the Lipa number, never a bank. */
                  kind: a.kind,
                }))}
                rate={rate}
                /* Home links straight in with the panel already open. */
                autoOpen={params.income === "1"}
              />
            ) : null}
            {canTakeMoney ? (
              <Link
                href="/app/finance/payments/new"
                title={t(locale, "Merge Payment")}
                className="focus-ring inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Layers className="h-4 w-4" />
                {t(locale, "Merge")}
              </Link>
            ) : null}
            {canAskForCredit ? (
              <AskForCredit compact rate={rate} canApprove={canDecideCredit} />
            ) : null}
            {canRecord ? (
            <RecordCostButton
              compact
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
                accountNumber: a.accountNumber,
              }))}
              quick={COMMON_EXPENSES}
              rate={rate}
            />
            ) : null}
          </div>
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <LedgerFilters
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        people={people}
        kinds={Object.entries(KIND_LABEL).map(([value, label]) => ({
          value,
          label: t(locale, label),
        }))}
        categories={Object.entries(EXPENSE_CATEGORY_LABELS).map(
          ([value, label]) => ({ value, label: t(locale, label) })
        )}
      />

      {/*
        In, out and net as cards rather than a line of small type.

        The ledger is the page somebody opens to answer "what did we take and
        what did we spend", and the answer was set in 13px above the table
        while every row of detail below it was louder. These three follow the
        filters, so narrowing to one account or one month re-totals them — a
        card that ignored the filter under it would be worse than no card.
      */}
      <dl className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        {[
          {
            k: t(locale, "Money in"),
            v: shillings(inTsh, inUsd),
            tone: "text-success",
            wash: "from-success/10",
            hint: t(locale, "Freight collected and money moved in"),
          },
          {
            k: t(locale, "Money out"),
            v: shillings(outTsh, outUsd),
            tone: "text-destructive",
            wash: "from-destructive/10",
            hint: t(locale, "Costs paid and money moved out"),
          },
          {
            k: t(locale, "Net"),
            v: shillings(inTsh - outTsh, inUsd - outUsd),
            tone: inTsh - outTsh >= 0 ? "text-foreground" : "text-destructive",
            wash: inTsh - outTsh >= 0 ? "from-brand/10" : "from-destructive/10",
            /* Says what these figures actually cover. The list below shows
               every row including the cancelled ones; the money does not. */
            hint:
              cancelledRows > 0
                ? `${total - cancelledRows} ${t(
                    locale,
                    total - cancelledRows === 1 ? "movement" : "movements"
                  )} · ${cancelledRows} ${t(locale, "cancelled, not counted")}`
                : `${total} ${t(locale, total === 1 ? "movement" : "movements")}`,
          },
        ].map((cell) => (
          <div
            key={cell.k}
            className={`bg-gradient-to-b ${cell.wash} to-transparent bg-card px-5 py-4`}
          >
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.k}
            </dt>
            <dd
              className={`mt-1 whitespace-nowrap font-display text-2xl font-bold leading-tight tabular-nums ${cell.tone}`}
            >
              {cell.v}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.hint}</p>
          </div>
        ))}
      </dl>

      {/*
        Costs still to pay, said in words that do not fight each other.

        It read "recorded but not yet paid, so not in the register", which
        states a fact and then withdraws it in the same breath — the owner
        could not tell whether it was money coming in or going out. It is
        neither yet: these are bills the business has written down and not
        settled, so no money has moved and nothing above can include them.
        The line now says what they are, then why they are not in the totals.
      */}
      {unpaidCount > 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          <Link
            href="/app/finance/transactions?kind=EXPENSE"
            className="font-medium text-warning hover:underline"
          >
            {shillings(unpaidTsh, unpaidUsd)} {t(locale, "in costs still to pay")}
          </Link>
          {" — "}
          {(() => {
            const biggest = [...unpaidByKind].sort(
              (a, b) => toNumber(b._sum.amountUsd) - toNumber(a._sum.amountUsd)
            )[0];
            if (!biggest) return null;
            const label = t(
              locale,
              EXPENSE_CATEGORY_LABELS[biggest.category] ?? biggest.category
            ).toLowerCase();
            const share =
              toNumber(biggest._sum.amountUsd) / unpaidUsd;
            return (
              <>
                {unpaidByKind.length === 1 || share > 0.6
                  ? `${t(locale, "mostly")} ${label}`
                  : `${unpaidCount} ${t(locale, unpaidCount === 1 ? "cost" : "costs")}`}
                {", "}
              </>
            );
          })()}
          {t(
            locale,
            "money the business owes. Not counted above, because none of it has left an account yet."
          )}
        </p>
      ) : null}

      {/*
        Where a credit sale is, given this register cannot hold one.

        A credit sale posts no ledger entry, and it must not: the cargo went, the
        revenue is real and no account was touched, so a row for it would put a
        figure into a running balance that no bank statement will ever show. The
        register stays a cash register.

        What it cannot do is stay silent. Somebody totalling Money in above and
        calling it "what we sold" is wrong by exactly this much, and an absence
        nobody explains reads as a missing row. So the gap is named, with the
        amount, and it says where those sales do live.

        The collected half of a credit IS above — as a payment, dated the day the
        money actually arrived. Those are the lines typed "Credit payment" rather
        than "Cash sale", which is the whole point of §13's distinction.
      */}
      {credit && (credit.outstandingUsd > 0.005 || credit.waivedUsd > 0.005) ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {credit.outstandingUsd > 0.005 ? (
            <>
              <Link
                href="/app/finance/credit"
                className="font-medium text-brand hover:underline"
              >
                {tsh(credit.outstandingUsd)}{" "}
                {t(locale, "billed on credit and still owed")}
              </Link>
              {" — "}
              {credit.count}{" "}
              {t(locale, credit.count === 1 ? "credit sale" : "credit sales")}
              {credit.overdueCount > 0 ? (
                <span className="font-medium text-destructive">
                  {", "}
                  {credit.overdueCount} {t(locale, "overdue")}
                </span>
              ) : null}
              {". "}
              {t(
                locale,
                "None of it is in this register: a credit sale moves no money, so it touches no account. It appears here as a credit payment on the day the customer pays."
              )}{" "}
            </>
          ) : null}
          {/* Forgiven debt is out of exposure but never out of sight, and it has
              its own condition rather than riding on the line above: a month
              where the desk wrote off millions and collected everything else
              would otherwise print nothing at all and read like a quiet one. */}
          {credit.waivedUsd > 0.005 ? (
            <span className="text-warning">
              {tsh(credit.waivedUsd)}{" "}
              {t(
                locale,
                "of credit has been written off, and that never appears here at all."
              )}
            </span>
          ) : null}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          title={
            q
              ? `${t(locale, "Nothing matches")} “${q}”`
              : t(locale, "No movements yet")
          }
          description={
            q
              ? t(locale, "Try a shorter search, or clear the filters.")
              : t(
                  locale,
                  "Every payment, cost and transfer writes a line here as it happens."
                )
          }
        />
      ) : (
        <>
        {/*
          A ledger on a phone.

          Nothing was hidden here — unlike the payments table, this one scrolls
          sideways, so every column was reachable. But a register is read down
          the balance, and you cannot follow a balance you have to swipe to see.
          Ten columns on a 375px screen is a spreadsheet somebody is panning
          around, not a page.

          So below `md`: one line per entry with what it was and what it moved,
          the running balance directly under the amount, and the codes on a
          third line for anyone matching a receipt in their hand. The same
          derivation as the table below — title, purpose, refs and category are
          computed once per entry in both, from the same fields.
        */}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
          {entries.map((entry) => {
            const inbound = entry.direction === "IN";
            const amount = formatMoney(toNumber(entry.amount), entry.currency);
            /* Reversed rows used to look exactly like any other line — the
               only trace was a separate "Correction" row elsewhere in the
               list, which a reader had to notice and match up by hand. */
            const cancelled = Boolean(entry.reversedBy);
            const collectedBy =
              entry.payment?.submission?.submittedBy?.name ?? null;

            let title = entry.description;
            let purpose: string | null = null;
            if (entry.payment) {
              title =
                entry.payment.invoice?.customer.name ??
                t(locale, "Customer deposit");
              purpose = cargoText(
                locale,
                entry.payment.invoice?.shipment ?? {},
                "description"
              );
            } else if (entry.expense) {
              title = entry.expense.description;
              purpose = entry.expense.vendor
                ? `${t(locale, "paid to")} ${entry.expense.vendor}`
                : null;
            } else if (entry.transfer) {
              title = inbound
                ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`;
              purpose = entry.transfer.reason;
            }

            const refs = [
              entry.payment?.receipt?.receiptNumber ??
                entry.expense?.expenseNumber ??
                entry.transfer?.transferNumber ??
                entry.entryNumber,
              ...cargoRefsOf(entry.payment),
            ].filter((v): v is string => Boolean(v));

            return (
              <li key={entry.id} className="relative">
                <Link
                  /*
                    Straight to the real page, not through the redirect.

                    /app/finance/transactions/[id] forwards a payment-kind
                    entry straight on to /app/finance/payments/[id] — it
                    never actually renders one. Linking through it anyway
                    left that forwarding URL sitting in the back-navigation
                    trail as if it were a real page, and going "back" to it
                    just bounced straight forward again to the payment the
                    reader was trying to leave. Routing here directly means
                    the trail only ever records places that actually exist.
                  */
                  href={
                    entry.payment
                      ? `/app/finance/payments/${entry.payment.id}`
                      : `/app/finance/transactions/${entry.id}`
                  }
                  className={cn(
                    "block p-4 transition-colors hover:bg-accent/40",
                    entry.expense?.category === "EXECUTIVE_DRAW" &&
                      "bg-warning/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--warning))]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          cancelled && "text-muted-foreground line-through"
                        )}
                      >
                        {cancelled ? (
                          <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground no-underline">
                            {t(locale, "Cancelled")}
                          </span>
                        ) : entry.expense?.category === "EXECUTIVE_DRAW" ? (
                          <span className="mr-1.5 rounded bg-warning px-1.5 py-0.5 text-[11px] font-bold text-warning-foreground">
                            {t(locale, "Executive draw")}
                          </span>
                        ) : null}
                        {title}
                      </p>
                      {purpose ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {purpose}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold tabular",
                          cancelled
                            ? "text-muted-foreground line-through"
                            : inbound
                              ? "text-success"
                              : "text-destructive"
                        )}
                      >
                        {inbound ? "+" : "−"}
                        {amount}
                      </p>
                      {/* The balance under the movement, which is the pair a
                          register is actually read in. */}
                      <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                        {showBalance(runningById.get(entry.id) ?? 0)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(entry.occurredAt, locale)}</span>
                    <span aria-hidden>·</span>
                    {/* The type belongs on the phone too. It is the difference
                        between a sale and a debt being settled, and hiding it on
                        small screens the way the table's column used to hide it
                        below lg left the two looking identical to whoever was
                        holding the phone. */}
                    <span className="font-medium text-foreground">
                      {typeOf(entry)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{entry.account.name}</span>
                    {refs.map((ref) => (
                      <span key={ref} className="whitespace-nowrap font-mono text-muted-foreground/70">
                        {ref}
                      </span>
                    ))}
                    {/* Who is answerable for the line. Absent from the phone
                        entirely — the table's column is hidden below lg, so
                        whoever was holding the phone could not see who had
                        recorded a movement or who collected it. */}
                    {entry.recordedBy ? (
                      <>
                        <span aria-hidden>·</span>
                        {collectedBy && collectedBy !== entry.recordedBy.name ? (
                          <>
                            <span className="whitespace-nowrap">
                              {t(locale, "Submitted by")}{" "}
                              <span className="text-brand">{collectedBy}</span>
                            </span>
                            <span aria-hidden>·</span>
                            <span className="whitespace-nowrap">
                              {t(locale, "Verified by")}{" "}
                              <span className="text-success">
                                {entry.recordedBy.name}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="whitespace-nowrap">
                            {entry.recordedBy.name}
                          </span>
                        )}
                      </>
                    ) : null}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Date")}</TableHead>
                <TableHead>{t(locale, "Description")}</TableHead>
                {/* Visible from md rather than lg. The difference between a cash
                    sale and a credit payment changes what the figure beside it
                    means, and a classification that disappears on a laptop is
                    not one. */}
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Type")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Account")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "By")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Debit")}</TableHead>
                {/* Its own key, not the plain word. "Credit" elsewhere in this
                    app means a sale on credit — money owed — and translates to
                    赊账; here it is the accounting column for money IN, which
                    is 收入, the pair of the 支出 beside it. One key for both
                    senses had the ledger telling a Chinese reader that its
                    incoming column was debt. */}
                <TableHead className="text-right">
                  {t(locale, "Credit (in)")}
                </TableHead>
                <TableHead className="text-right">
                  {t(locale, "Balance")}
                </TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  {t(locale, "Proof")}
                </TableHead>
                {canFix ? (
                  <TableHead className="w-36 text-right">
                    {t(locale, "Fix")}
                  </TableHead>
                ) : null}
                <TableHead className="w-8" aria-label={t(locale, "Open")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const inbound = entry.direction === "IN";
                const amount = formatMoney(toNumber(entry.amount), entry.currency);
                const proof =
                  entry.payment?.proofs[0]?.url ??
                  expenseFor(entry)?.receipts[0]?.url ??
                  null;

                /**
                 * Who the line is about, and — separately — what it was for.
                 *
                 * Two different questions, and the register was only answering
                 * the first. A cost paid to "Shell" said nothing about being
                 * fuel; a payment gave the customer's name and never said which
                 * cargo it cleared, which is the one thing anybody looking at a
                 * freight payment actually needs.
                 */
                let title = entry.description;
                let purpose: string | null = null;

                if (entry.payment) {
                  /* A deposit names the customer who handed the money over;
                     there is no consignment behind it yet to describe. */
                  title =
                    entry.payment.invoice?.customer.name ??
                    t(locale, "Customer deposit");
                  purpose = cargoText(
                    locale,
                    entry.payment.invoice?.shipment ?? {},
                    "description"
                  );
                } else if (entry.expense) {
                  title = entry.expense.description;
                  purpose = entry.expense.vendor
                    ? `${t(locale, "paid to")} ${entry.expense.vendor}`
                    : null;
                } else if (entry.transfer) {
                  title = inbound
                    ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                    : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`;
                  purpose = entry.transfer.reason;
                }

                // Every code that could be quoted back at you. Kept as a
                // list, not one joined string: these are full of hyphens, and
                // a browser will happily break a line inside TX-000104.
                const refs = [
                  entry.payment?.receipt?.receiptNumber ??
                    entry.expense?.expenseNumber ??
                    entry.transfer?.transferNumber ??
                    entry.entryNumber,
                  ...cargoRefsOf(entry.payment),
                  entry.payment?.reference,
                ].filter((v): v is string => Boolean(v));

                /**
                 * One classification per line, and only one.
                 *
                 * This column and a badge beside the description were both
                 * naming the same fact — "Freight payment" next to "Freight
                 * income" — which reads as two things until you work out it is
                 * one. The badge is gone; whether money came in or went out is
                 * already unmistakable from which of the two amount columns
                 * the figure is sitting in.
                 *
                 * So §13's transaction type went into this column rather than
                 * beside it. `typeOf` is the single derivation, shared with the
                 * phone list above, because two implementations of "is this a
                 * sale or a debt being settled" would disagree the first time
                 * one of them was edited.
                 */
                const category = typeOf(entry);

                /*
                  The boss taking money out is marked in gold, and only that.

                  On a register where every debit is already red, a boss
                  withdrawal read exactly like a customs bill — the owner's
                  point. Red is spoken for (money out) and green is spoken for
                  (money in), so this gets the one colour the money columns
                  never use: a gold rail down the edge of the row, a warm tint
                  behind it, and the category as a filled gold pill. It is not
                  a warning and nothing about the figure changes; it is simply
                  the row you can find without reading.
                */
                const bossDraw = entry.expense?.category === "EXECUTIVE_DRAW";
                /* See the note on the phone list above — a reversed line used
                   to read identically to a live one, and the only way to tell
                   was to notice a separate "Correction" row further down and
                   match the figures by hand. */
                const cancelled = Boolean(entry.reversedBy);
                /* Null for money taken at the counter: one person did the
                   whole thing, and naming them twice is noise rather than a
                   second fact. */
                const collectedBy =
                  entry.payment?.submission?.submittedBy?.name ?? null;

                return (
                  <TableRow
                    key={entry.id}
                    className={cn(
                      "group relative cursor-pointer transition-colors hover:bg-accent/40",
                      bossDraw &&
                        "bg-warning/[0.07] hover:bg-warning/[0.12] shadow-[inset_3px_0_0_0_hsl(var(--warning))]"
                    )}
                  >
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {formatDate(entry.occurredAt, locale)}
                    </TableCell>

                    {/* A floor as well as a ceiling. The table scrolls sideways on a
                        phone anyway, so squeezing this column there buys nothing
                        and costs the codes, which is what somebody standing at the
                        counter with a label in their hand is reading. */}
                    <TableCell className="min-w-[17rem] max-w-[30rem] py-2.5">
                      {/* Stretched over the whole row: a ledger line is one
                          thing, so anywhere on it opens it. Still a single
                          real link, so it is keyboard-reachable and can be
                          opened in a new tab. */}
                      <Link
                        /*
                    Straight to the real page, not through the redirect.

                    /app/finance/transactions/[id] forwards a payment-kind
                    entry straight on to /app/finance/payments/[id] — it
                    never actually renders one. Linking through it anyway
                    left that forwarding URL sitting in the back-navigation
                    trail as if it were a real page, and going "back" to it
                    just bounced straight forward again to the payment the
                    reader was trying to leave. Routing here directly means
                    the trail only ever records places that actually exist.
                  */
                  href={
                    entry.payment
                      ? `/app/finance/payments/${entry.payment.id}`
                      : `/app/finance/transactions/${entry.id}`
                  }
                        className={cn(
                          "block truncate text-sm font-medium after:absolute after:inset-0 after:content-[''] group-hover:text-brand",
                          cancelled && "text-muted-foreground line-through group-hover:text-muted-foreground"
                        )}
                      >
                        {cancelled ? (
                          <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground no-underline">
                            {t(locale, "Cancelled")}
                          </span>
                        ) : null}
                        {title}
                      </Link>
                      {/* Wraps rather than truncates. Squeezed onto one line a
                          long cargo description and a run of codes compete for
                          it, and whichever loses vanishes outright — which is
                          how "what was this for" disappeared on exactly the
                          narrow screens it matters most on. Two lines when it
                          needs them, one when it does not. Three is the
                          ceiling — enough for a long cargo description and
                          every code beneath it, without one wordy consignment
                          making a row five lines tall. */}
                      <span className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {purpose ? <>{purpose} </> : null}
                        {refs.map((ref, i) => (
                          <span key={ref}>
                            {i > 0 || purpose ? "· " : null}
                            <span className="whitespace-nowrap font-mono text-muted-foreground/70">
                              {ref}
                            </span>{" "}
                          </span>
                        ))}
                      </span>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-xs md:table-cell">
                      {/* The gold already marks these rows; naming the person
                          as well was the colour and the caption doing one job
                          twice — and it is not a word to leave on a screen
                          other people read. */}
                      {bossDraw ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">
                          {category}
                        </span>
                      ) : (
                        category
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-2.5 text-xs">
                      <Link
                        href={`/app/finance/accounts/${entry.account.id}`}
                        className="relative z-10 hover:text-brand"
                      >
                        {entry.account.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell min-w-[8.5rem] py-2.5 text-xs text-muted-foreground">
                      {/* Two people, when two people were involved, said in the
                          words the desk uses: submitted, then verified.

                          Coloured rather than labelled twice over — the eye
                          reads the pairing off the two tints before it reads
                          the words, and at this size that is the difference
                          between a fact and a smudge. One line each, kept from
                          wrapping, so a row stays the height it always was. */}
                      {collectedBy && collectedBy !== entry.recordedBy?.name ? (
                        <span className="flex max-w-[9rem] flex-col gap-0.5 text-[11px] leading-tight">
                          <span
                            className="truncate"
                            title={`${t(locale, "Submitted by")} ${collectedBy}`}
                          >
                            <span className="text-muted-foreground/60">
                              {t(locale, "Submitted by")}{" "}
                            </span>
                            <span className="text-brand">{collectedBy}</span>
                          </span>
                          <span
                            className="truncate"
                            title={`${t(locale, "Verified by")} ${entry.recordedBy?.name ?? ""}`}
                          >
                            <span className="text-muted-foreground/60">
                              {t(locale, "Verified by")}{" "}
                            </span>
                            <span className="text-success">
                              {entry.recordedBy?.name}
                            </span>
                          </span>
                        </span>
                      ) : (
                        (entry.recordedBy?.name ?? "—")
                      )}
                    </TableCell>

                    {/* Two columns, because that is how a ledger is read. */}
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {inbound ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cancelled ? "text-muted-foreground line-through" : "text-destructive"}>
                          {amount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {inbound ? (
                        <span className={cancelled ? "text-muted-foreground line-through" : "text-success"}>
                          {amount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm font-semibold tabular">
                      {showBalance(runningById.get(entry.id) ?? 0)}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell py-2.5 text-right text-xs">
                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="relative z-10 inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t(locale, "View")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/*
                      Put a line right without opening it first.

                      Both are links, not one-click actions: the pencil goes to
                      the cost that owns the figure, and the cancel goes to the
                      entry's own page where a reason has to be typed. A
                      one-tap cancel in a dense register is how the wrong row
                      gets reversed on a Friday afternoon.

                      z-10 because the whole row is already a stretched link.
                    */}
                    {canFix ? (
                      <TableCell className="w-36 py-2.5 pr-1 text-right">
                        {/*
                          Both of these used to be links: the pencil opened the
                          invoice, the cancel opened the entry's own page. A desk
                          reading down the register is looking at the line it
                          wants to fix, and sending it away to find the bill and
                          then find its way back is how a fifty-four shilling
                          test entry survives a week.

                          Cancelling is still a reversal, not a deletion — the
                          ledger is append-only, which is why no figure here has
                          ever drifted. What the desk means by delete happens in
                          full; it is recorded rather than hidden.
                        */}
                        <LedgerRowFix
                          accounts={accounts}
                          subject={{
                            entryId: entry.id,
                            paymentId: entry.payment?.id ?? null,
                            paymentReference: entry.payment?.reference ?? null,
                            paymentNote: entry.payment?.note ?? null,
                            paymentAccountId: entry.payment?.accountId ?? null,
                            amount: toNumber(entry.amount),
                            currency: entry.currency,
                            /* A combined payment answers several bills; moving
                               its figure is the allocation screen's question. */
                            amountEditable:
                              entry.payment !== null &&
                              entry.payment.invoiceId !== null &&
                              entry.payment._count.allocations <= 1,
                            /* expenseFor, not entry.expense: a corrected
                               line's own expenseId is empty by design (see the
                               note above orphanedExpenseIds), and reading that
                               as "not an expense" would make fixing a fix
                               forget which cost it belongs to. */
                            expenseId: expenseFor(entry)?.id ?? null,
                            expenseDescription:
                              expenseFor(entry)?.description ?? null,
                            expenseCategory: expenseFor(entry)?.category ?? null,
                            expenseClass: expenseFor(entry)?.expenseClass ?? null,
                            expenseVendor: expenseFor(entry)?.vendor ?? null,
                            expenseNote: expenseFor(entry)?.note ?? null,
                            expenseAccountId: expenseFor(entry)?.accountId ?? null,
                            expenseBatchId: expenseFor(entry)?.batchId ?? null,
                            expenseIncurredAt: expenseFor(entry)
                              ? expenseFor(entry)!.incurredAt.toISOString().slice(0, 10)
                              : null,
                            expenseStatus: expenseFor(entry)?.status ?? null,
                            attachments:
                              entry.payment?.proofs ?? expenseFor(entry)?.receipts ?? [],
                            /* A line already answered by a reversing line has
                               nothing left to do — and a correction is itself a
                               line, which must not be cancellable in turn. */
                            reversed: Boolean(
                              entry.reversedBy || entry.reversesId
                            ),
                            voidReason: entry.payment?.voidReason ?? null,
                            voidedByName: entry.payment?.voidedBy?.name ?? null,
                          }}
                        />
                      </TableCell>
                    ) : null}

                    <TableCell className="w-8 py-2.5 pr-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-brand" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
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
