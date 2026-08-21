import "server-only";

import type { AccountKind, Prisma } from "@prisma/client";

import { collectionsOverview } from "@/lib/collections";
import { creditNotInTheLedger } from "@/lib/credit-queries";
import { financeDashboard } from "@/lib/finance-dashboard";
import { toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { windowFor } from "@/lib/profit";

/**
 * Does what the books say match what the accounts hold.
 *
 * Every figure in this app is derived rather than stored, which removes the
 * classic reconciliation problem — there is no cached balance to drift from its
 * source. What it cannot remove is the other kind: a payment recorded on an
 * invoice but never posted to an account, an invoice whose status and whose
 * arithmetic disagree, an account showing less than nothing. Those are writes
 * that half-happened, and no amount of deriving finds them, because each side
 * is internally consistent and only the pair is wrong.
 *
 * So each check below asks the same question twice, by two different routes,
 * and reports the gap. A clean line is not decoration: "0 differences over 431
 * payments" is the finding, and a page that only listed problems could not tell
 * the reader whether it had looked.
 *
 * THREE THINGS THIS ENGINE ANSWERS, AND WHERE EACH ONE COMES FROM.
 *
 *  - The integrity checks. Two routes to one number, computed here because
 *    nothing else in the app has any reason to ask a question twice on purpose.
 *  - The positions: what the ledger says each account holds. Straight from
 *    accountBalances(), the same call the Accounts page and the finance
 *    dashboard read, so a manager quoting this page and a clerk quoting that
 *    one cannot arrive at the meeting with different balances.
 *  - The collections picture: composed from collectionsOverview() and
 *    financeDashboard(), the two engines that already answer it for the desks
 *    that do the work. Nothing here re-aggregates an invoice. That is the whole
 *    point — the manager's screen must be able to DISAGREE with nobody, and a
 *    second query answering "what do they owe us" is the bug this codebase has
 *    already been bitten by more than once.
 *
 * WHAT THIS SYSTEM CANNOT RECONCILE, SAID PLAINLY RATHER THAN FAKED.
 *
 * A bank or a mobile-money float has a second side that lives at the bank, and
 * nothing imports it: there is no statement model, no import, no feed. So for
 * those accounts the ledger is not "checked" against anything — it is the only
 * record there is, and the page says so in one line rather than showing a
 * comparison against a number this code invented. The cash tin is the one
 * account with a real second side, because somebody physically counts it and
 * CashCount stores both what was there and what the ledger believed at that
 * instant. That contrast is worth showing; a fabricated bank variance is not.
 */
export type CheckSide = {
  label: string;
  /** Already written out — a count, or the dollar figure. */
  value: string;
  /**
   * The same money, in dollars, when the side IS money.
   *
   * The screen leads in shillings everywhere else in this app and it cannot do
   * that from a string that has already been formatted. So the raw figure
   * travels beside the written one, the page converts it at the published rate,
   * and the dollar string stays as the small print underneath. Absent — not
   * null — on a side that counts things rather than money, so the page's test
   * is "is this money" and not "is this money and also not zero".
   */
  usd?: number;
};

export type Check = {
  key: string;
  label: string;
  /** What agreeing would mean, in words, before the numbers. */
  question: string;
  left: CheckSide;
  right: CheckSide;
  /** Zero when the two sides agree. */
  difference: number;
  ok: boolean;
  /** Present when a gap is expected and correct, rather than a fault. */
  expected?: string;
  href?: string;
};

/** One account, as the ledger has it. */
export type AccountPosition = {
  id: string;
  name: string;
  institution: string | null;
  currency: string;
  inflow: number;
  outflow: number;
  balance: number;
  /** The ledger's own dollar column — each movement at the rate it was posted
   *  at, never today's. Small print beside a shilling balance, never a total. */
  balanceUsd: number;
  entries: number;
  lastMovedAt: Date | null;
  /** Null until somebody records what was already in the account. Until then
   *  the figures above are movements recorded here, not a balance. */
  openingSetAt: Date | null;
  /** The physical count, where one exists. Cash only — see the header. */
  count: {
    countedAt: Date;
    countedAmount: number;
    expectedAmount: number;
    /** Counted less expected: negative is short, positive is over. */
    variance: number;
    countedBy: string | null;
  } | null;
};

export type PositionGroup = {
  kind: AccountKind;
  label: string;
  /** What the ledger's figure can be checked against — or the honest sentence
   *  saying nothing in this system records the other side of it. */
  counterpart: string;
  /** True only where a second side actually exists to compare against. */
  checkable: boolean;
  accounts: AccountPosition[];
  entries: number;
  /**
   * Subtotalled per currency, deliberately.
   *
   * The bank group holds shillings and dollars. Adding them needs a rate, and
   * an engine that picks one produces a total that disagrees with the accounts
   * printed under it the morning the CEO publishes a new one — which is exactly
   * the bug lib/../accounts already documents. So the money is added only where
   * it is the same money.
   */
  totals: { currency: string; inflow: number; outflow: number; balance: number }[];
};

export type CollectionsReconciliation = {
  /** The period the billing figures below cover, in the reader's language. */
  periodLabel: string;
  /** Two-route checks, same shape and same rendering as the integrity ones. */
  checks: Check[];
  /** This period's book, as financeDashboard already states it. */
  billed: {
    expectedUsd: number;
    collectedUsd: number;
    outstandingUsd: number;
    rate: number | null;
  };
  /** The whole ledger of obligations, not just this period's. */
  book: {
    outstandingUsd: number;
    owingCount: number;
    awaitingPayment: number;
    pendingCount: number;
    rejected: number;
    notesReady: number;
    successRate: number | null;
    submitted: number;
  };
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const KIND_ORDER: AccountKind[] = ["BANK", "MOBILE_MONEY", "CASH"];

const KIND_LABEL: Record<AccountKind, string> = {
  BANK: "Bank accounts",
  MOBILE_MONEY: "Mobile money",
  /* Named for what it is. The owner's spec asks for "petty cash" as a figure of
     its own; this schema has no such model and inventing one would put a second
     answer on the page for money the CASH accounts already hold. So the tins are
     grouped as cash and labelled cash. */
  CASH: "Cash in hand",
};

const COUNTERPART: Record<AccountKind, { text: string; checkable: boolean }> = {
  BANK: {
    text: "No bank statement is imported into this system, so there is nothing here to check these against. This is what the company recorded — not what the bank holds. Closing that gap means reading the statement beside this list.",
    checkable: false,
  },
  MOBILE_MONEY: {
    text: "No till statement is imported either. Same reading as the banks: these are the movements this system was told about, not what the network says the float is.",
    checkable: false,
  },
  CASH: {
    text: "The tin is the one account with a real second side: somebody counts it, and the count is stored with what the ledger believed at that moment. That difference is below, and it is never auto-corrected — a shortfall that balances itself is a shortfall nobody notices.",
    checkable: true,
  },
};

export async function reconciliation(locale: Locale = "en") {
  /* The month, and the month before it — the same window the P&L opens on, so
     a manager reading this page and the profit page on the same morning is
     reading the same period without having to check. */
  const period = windowFor("month", locale);

  const [
    paymentAgg,
    postedSum,
    invoiceAgg,
    balances,
    accounts,
    credit,
    counts,
    collections,
    finance,
  ] = await Promise.all([
      /* Every payment that still counts — a cancelled one was answered by a
         reversing line, so both sides of the check drop it together.

         One statement rather than the table: this used to fetch every payment
         ever taken just to count the ones missing a register line and sum the
         rest, which read the whole history on every open of the page. The
         count, the sum, the offenders and the "all of them lack an account"
         diagnostic now come out of a single snapshot, so they still describe
         exactly the same rows as each other — which the old row-level pass
         guaranteed and a handful of separate aggregates would not.

         COALESCE(creditedAmount, amount) is the discipline every money total
         in this codebase reads; lib/profit.ts documents what it cost the one
         time a total read creditedAmount alone. */
      prisma.$queryRaw<
        {
          taken: number;
          collected: Prisma.Decimal;
          unposted: number;
          unattributed: number;
        }[]
      >`
        SELECT
          COUNT(*)::int AS "taken",
          COALESCE(SUM(COALESCE("creditedAmount", "amount")), 0) AS "collected",
          COUNT(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM "LedgerEntry" l
            WHERE l."paymentId" = "Payment"."id" AND l."kind" = 'CUSTOMER_PAYMENT'
          ))::int AS "unposted",
          COUNT(*) FILTER (WHERE "accountId" IS NULL AND NOT EXISTS (
            SELECT 1 FROM "LedgerEntry" l
            WHERE l."paymentId" = "Payment"."id" AND l."kind" = 'CUSTOMER_PAYMENT'
          ))::int AS "unattributed"
        FROM "Payment"
        WHERE "voidedAt" IS NULL
      `,
      prisma.ledgerEntry.aggregate({
        where: { kind: "CUSTOMER_PAYMENT" },
        _sum: { amountUsd: true },
      }),
      /* The label test is row-level — a status can only be judged against its
         own bill's arithmetic — but the page never shows the rows, only how
         many disagree. So the arithmetic moved into the statement, and the
         denominator printed beside it ("live bills") is counted in the same
         snapshot: the only honest denominator for "none of them disagree".

         financeDashboard's groupBy runs a similar filter and is deliberately
         not read here: it is taken at a different instant, and it exposes only
         its PAID, UNPAID and PARTIALLY_PAID buckets — a written-off bill would
         silently leave the denominator. */
      prisma.$queryRaw<{ live: number; mislabelled: number }[]>`
        SELECT
          COUNT(*)::int AS "live",
          COUNT(*) FILTER (WHERE
            ("status" = 'PAID' AND "amountPaid" + 0.005 < "total") OR
            ("status" = 'UNPAID' AND "amountPaid" > 0.005) OR
            ("status" = 'PARTIALLY_PAID'
              AND ("amountPaid" <= 0.005 OR "amountPaid" + 0.005 >= "total"))
          )::int AS "mislabelled"
        FROM "Invoice"
        WHERE "status" NOT IN ('DRAFT', 'VOID')
      `,
      accountBalances(prisma),
      prisma.companyAccount.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          kind: true,
          institution: true,
          currency: true,
          active: true,
          openingSetAt: true,
        },
      }),
      creditNotInTheLedger(),
      /* The newest count per tin. Reading stored columns — countedAmount, the
         ledger figure snapshotted beside it, and the difference — rather than
         re-deriving any of them, so this cannot disagree with the count the
         Accounts page prints from the same rows. */
      prisma.cashCount.findMany({
        where: { account: { kind: "CASH" } },
        orderBy: [{ countedAt: "desc" }],
        distinct: ["accountId"],
        select: {
          accountId: true,
          countedAt: true,
          countedAmount: true,
          expectedAmount: true,
          variance: true,
          countedBy: { select: { name: true } },
        },
      }),
      collectionsOverview(),
      /* Heavier than a hand-rolled invoice aggregate would be, and taken
         anyway. The alternative is this page owning its own answer to "what
         was billed and what came back", which is the one thing the owner has
         said must never happen: two screens, two totals, one argument. */
      financeDashboard(period.window, period.previous),
    ]);

  /* ---------------------------------------- 1. every payment on the register */
  const pay = paymentAgg[0] ?? {
    taken: 0,
    collected: 0,
    unposted: 0,
    unattributed: 0,
  };

  /* ---------------------------------------- 2. the same money, both ways

     Summed in the statement that counted them, rather than read from executiveStats()
     .allTimeCollected, which answers "money collected, all time" for the
     dashboard. Everywhere else in this file a second answer to a question is
     the bug; here it is the instrument. The check asks whether the payments and
     the register tell the same story, so one side has to be the payments' own
     account of themselves. Sourcing it from an engine that will one day read
     the register would leave the page comparing a figure with itself and
     reporting agreement for a company whose register was never written.

     It also has to describe exactly these rows. The check printed above it says
     "N payments taken", and both N and this total come out of the same
     statement, so neither can describe a set the other never saw. */
  const collectedUsd = toNumber(pay.collected);
  /* The register's own total nets its reversing lines, so a cancelled payment
     leaves +100 and −100 behind and contributes nothing — which is why this
     side reads every CUSTOMER_PAYMENT line while the other reads only live
     payments. Filtering both the same way would hide exactly the case where a
     cancellation reversed the bill and not the register. */
  const ledgerUsd = toNumber(postedSum._sum.amountUsd ?? 0);

  /* ---------------------------------------- 3. status against arithmetic */
  const bills = invoiceAgg[0] ?? { live: 0, mislabelled: 0 };

  /* ---------------------------------------- 4. accounts below zero

     TWO DIFFERENT FAULTS, AND THE FIRST DRAFT CALLED BOTH OF THEM THE SECOND.

     An account whose opening balance was never recorded starts its life on this
     system at zero, so the first expense paid out of it drives it negative and
     keeps it there for good. The money is fine; what is missing is the sentence
     saying what was in the account on the day it was put on the system. That is
     a setup step nobody did, not a booking error, and telling a manager to go
     hunting through the register for a mistake that is not there wastes the one
     thing this page is supposed to save.

     An account that HAS an opening balance and is still below zero is the real
     finding: more money has left it than ever existed in it, which cannot have
     happened, so something was booked against the wrong account.
  */
  const byId = new Map(balances.map((b) => [b.accountId, b]));
  const below = accounts
    .map((a) => {
      const row = byId.get(a.id);
      const balance = row ? toNumber(row.inflow) - toNumber(row.outflow) : 0;
      return { ...a, balance };
    })
    .filter((a) => a.balance < -0.005);

  const negative = below.filter((a) => a.openingSetAt !== null);
  const neverOpened = below.filter((a) => a.openingSetAt === null);

  const checks: Check[] = [
    {
      key: "posted",
      label: "Payments on the register",
      question: "Every payment recorded against a bill should also be a line on the ledger.",
      left: { label: "Payments taken", value: String(pay.taken) },
      right: { label: "Missing a line", value: String(pay.unposted) },
      difference: pay.unposted,
      ok: pay.unposted === 0,
      /* The cause, where the data can name it, rather than a count somebody has
         to go and diagnose. A payment recorded without naming an account has
         nowhere to post to, so the register never hears about it. */
      expected:
        pay.unposted > 0 && pay.unposted === pay.unattributed
          ? "All of these were recorded without naming an account, so there was nowhere to post them. Attribute them to an account and they join the register."
          : undefined,
      href: "/app/finance/transactions",
    },
    {
      key: "collected",
      label: "Money collected",
      question: "The bills say this much came in. The accounts should say the same.",
      left: { label: "Settled against bills", value: usd(collectedUsd), usd: collectedUsd },
      right: { label: "Received into accounts", value: usd(ledgerUsd), usd: ledgerUsd },
      difference: Math.abs(collectedUsd - ledgerUsd),
      ok: near(collectedUsd, ledgerUsd),
      href: "/app/finance/transactions",
    },
    {
      key: "credit",
      label: "Billed on credit",
      question: "Cargo released against a promise. Revenue, but no money in any account.",
      left: {
        label: "Still owed",
        value: usd(credit.outstandingUsd),
        usd: credit.outstandingUsd,
      },
      right: {
        label: "Of which overdue",
        value: usd(credit.overdueUsd),
        usd: credit.overdueUsd,
      },
      difference: 0,
      ok: true,
      /* The one gap on this page that is correct by design, said so plainly —
         somebody comparing revenue to the bank will find this difference, and
         they should find the explanation in the same place. */
      expected:
        "This gap is meant to be here. A credit sale posts no ledger line, because nothing reached an account — that is what stops it being counted as cash.",
      href: "/app/finance/credit",
    },
    {
      key: "status",
      label: "Bills labelled correctly",
      question: "A bill marked paid should be paid in full, and one marked unpaid untouched.",
      left: { label: "Live bills", value: String(bills.live) },
      right: { label: "Label disagrees", value: String(bills.mislabelled) },
      difference: bills.mislabelled,
      ok: bills.mislabelled === 0,
      href: "/app/finance/invoices",
    },
    {
      key: "negative",
      label: "Accounts below zero",
      question: "No account can hold less than nothing. One that does was booked wrong.",
      left: { label: "Accounts", value: String(accounts.filter((a) => a.active).length) },
      right: { label: "Below zero", value: String(negative.length) },
      difference: negative.length,
      ok: negative.length === 0,
      expected:
        neverOpened.length > 0
          ? `${neverOpened.length} more ${neverOpened.length === 1 ? "account reads" : "accounts read"} below zero only because no opening balance was ever recorded for ${neverOpened.length === 1 ? "it" : "them"}: ${neverOpened.map((a) => a.name).join(", ")}. Set the opening balance and the figure becomes real.`
          : undefined,
      href: "/app/finance/accounts",
    },
  ];

  /* ---------------------------------------- 5. what each account holds

     Not a sixth check — a statement of position, which is the thing a manager
     asked to "reconcile the bank" actually opens a screen to see. The figures
     are accountBalances() untouched: the same rows the Accounts page draws its
     cards from and the same rows financeDashboard totals into the cash
     position. Three screens, one query.
  */
  const countByAccount = new Map(counts.map((c) => [c.accountId, c]));
  const held = accounts
    .filter((a) => a.active)
    .map((a): AccountPosition & { kind: AccountKind } => {
      const row = byId.get(a.id);
      const count = countByAccount.get(a.id);
      const inflow = toNumber(row?.inflow ?? 0);
      const outflow = toNumber(row?.outflow ?? 0);
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        kind: a.kind,
        currency: a.currency,
        inflow,
        outflow,
        balance: inflow - outflow,
        balanceUsd: toNumber(row?.inflowUsd ?? 0) - toNumber(row?.outflowUsd ?? 0),
        entries: Number(row?.entries ?? 0),
        lastMovedAt: row?.lastMovedAt ?? null,
        openingSetAt: a.openingSetAt,
        count: count
          ? {
              countedAt: count.countedAt,
              countedAmount: toNumber(count.countedAmount),
              expectedAmount: toNumber(count.expectedAmount),
              variance: toNumber(count.variance),
              countedBy: count.countedBy?.name ?? null,
            }
          : null,
      };
    });

  const positions: PositionGroup[] = KIND_ORDER.map((kind) => {
    const rows = held.filter((a) => a.kind === kind);
    const currencies = [...new Set(rows.map((r) => r.currency))];
    return {
      kind,
      label: KIND_LABEL[kind],
      counterpart: COUNTERPART[kind].text,
      checkable: COUNTERPART[kind].checkable,
      accounts: rows,
      entries: rows.reduce((n, r) => n + r.entries, 0),
      totals: currencies.map((currency) => {
        const of = rows.filter((r) => r.currency === currency);
        return {
          currency,
          inflow: of.reduce((n, r) => n + r.inflow, 0),
          outflow: of.reduce((n, r) => n + r.outflow, 0),
          balance: of.reduce((n, r) => n + r.balance, 0),
        };
      }),
    };
  }).filter((group) => group.accounts.length > 0);

  /* An archived account still holding money is not a rounding detail: it is
     money the position above does not count, sitting somewhere nobody looks.
     Shown as its own line rather than folded into a group, because it is not
     part of the live position and pretending otherwise would overstate it. */
  const archivedHolding = accounts
    .filter((a) => !a.active)
    .map((a) => {
      const row = byId.get(a.id);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: toNumber(row?.inflow ?? 0) - toNumber(row?.outflow ?? 0),
      };
    })
    .filter((a) => Math.abs(a.balance) > 0.005);

  /* ---------------------------------------- 6. collections

     Every figure here belongs to a desk that already computes it. The point of
     putting them side by side is that the two desks reach them by different
     routes — Support counts the bills it is chasing, the books group invoices
     by status — and a manager signing anything off wants to know the two
     agree BEFORE somebody quotes one of them at him.
  */
  const owedByStatus = finance.collections.unpaid + finance.collections.partiallyPaid;
  const billedGap =
    finance.collections.expectedUsd - finance.collections.collectedUsd;

  const collectionChecks: Check[] = [
    {
      key: "owing",
      label: "Bills still owed on",
      question:
        "The chase list and the invoice book should be naming exactly the same bills.",
      left: { label: "On the chase list", value: String(collections.owingCount) },
      right: { label: "Unpaid or part-paid", value: String(owedByStatus) },
      difference: Math.abs(collections.owingCount - owedByStatus),
      ok: collections.owingCount === owedByStatus,
      href: "/app/finance/invoices",
    },
    {
      key: "outstanding",
      label: "Money still owed",
      question:
        "What Support is chasing should be, to the cent, what the books call receivable.",
      left: {
        label: "Chased by Support",
        value: usd(collections.outstandingUsd),
        usd: collections.outstandingUsd,
      },
      right: {
        label: "Receivable in the books",
        value: usd(finance.position.receivableUsd),
        usd: finance.position.receivableUsd,
      },
      difference: Math.abs(collections.outstandingUsd - finance.position.receivableUsd),
      ok: near(collections.outstandingUsd, finance.position.receivableUsd),
      href: "/app/finance/invoices",
    },
    {
      key: "billed",
      label: "This period's book adds up",
      question:
        "Billed, less what has been settled against those bills, is what is still owed on them.",
      left: { label: "Billed less settled", value: usd(billedGap), usd: billedGap },
      right: {
        label: "Still owed on them",
        value: usd(finance.collections.outstandingUsd),
        usd: finance.collections.outstandingUsd,
      },
      difference: Math.abs(billedGap - finance.collections.outstandingUsd),
      ok: near(billedGap, finance.collections.outstandingUsd),
      /* The only way these part company: more has been settled against the
         period's bills than they came to, so "still owed" floors at nothing and
         the overpayment has nowhere to show. Worth a sentence, because the
         money is real and it is sitting on the wrong bill or ahead of one. */
      expected:
        billedGap < -0.005
          ? "More has been settled against this period's bills than they came to. Somebody has paid ahead, or a payment is sitting on the wrong bill — either way the credit is real and it is not on this period's book."
          : undefined,
      href: "/app/finance/invoices",
    },
    {
      key: "claims",
      label: "Claims waiting on Finance",
      question:
        "A customer says they have paid. Until Finance agrees, no account has that money.",
      left: { label: "Support has sent up", value: String(collections.pendingCount) },
      right: {
        label: "Awaiting verification",
        value: String(finance.collections.awaitingVerification),
      },
      difference: Math.abs(
        collections.pendingCount - finance.collections.awaitingVerification
      ),
      ok: collections.pendingCount === finance.collections.awaitingVerification,
      /* Deliberately a count and not an amount, and said so. A submission is
         stored in whatever currency the customer sent, so a sum across them
         would add shillings to dollars — see lib/collections.ts, which refuses
         the same total for the same reason. */
      expected:
        "No money figure is shown for these on purpose: a claim is stored in the currency the customer sent, so adding them together would add shillings to dollars. The count is the honest figure until Finance rules on each one.",
      href: "/app/finance/verify",
    },
  ];

  const collectionsReconciliation: CollectionsReconciliation = {
    periodLabel: period.window.label,
    checks: collectionChecks,
    billed: {
      expectedUsd: finance.collections.expectedUsd,
      collectedUsd: finance.collections.collectedUsd,
      outstandingUsd: finance.collections.outstandingUsd,
      rate: finance.collections.rate,
    },
    book: {
      outstandingUsd: collections.outstandingUsd,
      owingCount: collections.owingCount,
      awaitingPayment: collections.awaitingPayment,
      pendingCount: collections.pendingCount,
      rejected: collections.rejected,
      notesReady: collections.notesReady,
      successRate: collections.successRate,
      submitted: collections.submitted,
    },
  };

  return {
    checks,
    unposted: pay.unposted,
    negative,
    neverOpened,
    credit,
    positions,
    archivedHolding,
    collections: collectionsReconciliation,
  };
}
