import Link from "next/link";
import type { Metadata } from "next";
import {
  Banknote,
  Building2,
  CircleHelp,
  Smartphone,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import {
  CashCountPanel,
  TransferPanel,
} from "@/components/app/treasury-panels";
import { financeTabs } from "@/lib/finance-tabs";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Accounts" };

const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

const KIND_LABEL = {
  BANK: "Bank",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

/**
 * The company's own money: which accounts exist and what has moved through them.
 *
 * Every figure here is derived from the ledger, never stored. That is the same
 * discipline as every other money figure in this app, and the reason none of
 * them has drifted from the rows underneath.
 *
 * Two things this page is careful to say out loud rather than paper over:
 *
 *  - Until an opening balance is entered, these are MOVEMENTS RECORDED HERE,
 *    not balances. There is money in CRDB today that never passed through this
 *    system, and a confident wrong total is worse than an honest partial one.
 *  - Money nobody attributed to an account is shown as its own line. A gap you
 *    can see is a question somebody can answer; a gap folded into a total is a
 *    number that is quietly wrong forever.
 */
export default async function AccountsPage() {
  const user = await requirePermission("account.view");

  const [accounts, balances, unattributed, counts] = await Promise.all([
    prisma.companyAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    }),
    accountBalances(prisma),
    // Money that was taken but never told where it went. Summed in USD because
    // it is by definition a mixture of currencies.
    prisma.payment.aggregate({
      where: { accountId: null },
      _sum: { creditedAmount: true },
      _count: true,
    }),
    prisma.cashCount.findMany({
      orderBy: { countedAt: "desc" },
      take: 6,
      include: {
        account: { select: { name: true, currency: true } },
        countedBy: { select: { name: true } },
      },
    }),
  ]);

  const byAccount = new Map(balances.map((row) => [row.accountId, row]));

  const rows = accounts.map((account) => {
    const movement = byAccount.get(account.id);
    const inflow = toNumber(movement?.inflow ?? 0);
    const outflow = toNumber(movement?.outflow ?? 0);
    const inflowUsd = toNumber(movement?.inflowUsd ?? 0);
    const outflowUsd = toNumber(movement?.outflowUsd ?? 0);
    return {
      account,
      inflow,
      outflow,
      net: inflow - outflow,
      netUsd: inflowUsd - outflowUsd,
      entries: Number(movement?.entries ?? 0),
      lastMovedAt: movement?.lastMovedAt ?? null,
    };
  });

  const totalUsd = rows.reduce((sum, row) => sum + row.netUsd, 0);
  const unattributedUsd = toNumber(unattributed._sum.creditedAmount);
  const needsOpening = accounts.filter((a) => a.active && a.openingSetAt === null);

  // Only live accounts can send, receive or be counted. An archived account is
  // a historical record, not somewhere money goes.
  const treasuryAccounts = rows
    .filter((row) => row.account.active)
    .map((row) => ({
      id: row.account.id,
      name: row.account.name,
      kind: row.account.kind as string,
      currency: row.account.currency,
    }));
  // What the ledger says is in each tin, so the count form can say "short by"
  // as the number is typed rather than after it is submitted.
  const expectedCash = Object.fromEntries(
    rows.map((row) => [row.account.id, row.net])
  );

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Where the company's money sits, and everything that has moved through it. Each figure is derived from the ledger — nothing here is typed."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* Said first, and plainly. Every total below is understated by whatever
          was already in these accounts before this system existed, and that is
          not a rounding error — it is most of the money. */}
      {needsOpening.length > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium">
              These are movements recorded here, not balances
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {needsOpening.length === accounts.filter((a) => a.active).length
                ? "No account has an opening balance yet"
                : `${needsOpening.length} account${needsOpening.length === 1 ? " has" : "s have"} no opening balance yet`}
              , so each figure below counts only what this system has seen. Whatever
              was already in the account is missing from it. Set the opening balances
              and every total becomes the real one.
            </p>
          </div>
        </div>
      ) : null}

      <dl className="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Banknote className="h-3.5 w-3.5 text-brand" />
            Recorded across all accounts
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatUsd(totalUsd)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Six accounts, one currency each, summed in USD
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleHelp
              className={`h-3.5 w-3.5 ${unattributed._count ? "text-warning" : "text-muted-foreground"}`}
            />
            Unattributed
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatUsd(unattributedUsd)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unattributed._count === 0
              ? "Every payment says where it landed"
              : `${unattributed._count} payment${unattributed._count === 1 ? "" : "s"} with no account named`}
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Accounts in use</dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {accounts.filter((a) => a.active).length}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.filter((r) => r.entries > 0).length} with movement so far
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Movements recorded</dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {rows.reduce((sum, row) => sum + row.entries, 0)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Link href="/app/finance/transactions" className="hover:text-brand">
              Open the register
            </Link>
          </p>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ account, inflow, outflow, net, netUsd, entries, lastMovedAt }) => {
          const Icon = KIND_ICON[account.kind];
          return (
            <section
              key={account.id}
              className={`rounded-xl border bg-card p-5 shadow-soft ${
                account.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{account.name}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {KIND_LABEL[account.kind]}
                    {account.accountNumber ? ` · ${account.accountNumber}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {account.currency}
                </Badge>
              </div>

              <p className="mt-4 font-display text-2xl font-bold tabular-nums">
                {formatMoney(net, account.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {account.openingSetAt === null
                  ? "recorded here — no opening balance set"
                  : "balance"}
                {account.currency === "USD" ? "" : ` · ${formatUsd(netUsd)}`}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-center">
                <div className="bg-card px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">In</dt>
                  <dd className="font-mono text-sm tabular-nums text-success">
                    {formatMoney(inflow, account.currency)}
                  </dd>
                </div>
                <div className="bg-card px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Out</dt>
                  <dd className="font-mono text-sm tabular-nums">
                    {outflow === 0 ? "—" : formatMoney(outflow, account.currency)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-muted-foreground">
                {entries === 0 ? (
                  "Nothing recorded against this account yet"
                ) : (
                  <>
                    {entries} movement{entries === 1 ? "" : "s"}
                    {lastMovedAt ? `, last ${formatRelative(lastMovedAt)}` : ""} ·{" "}
                    <Link
                      href={`/app/finance/transactions?account=${account.id}`}
                      className="hover:text-brand"
                    >
                      see them
                    </Link>
                  </>
                )}
              </p>
            </section>
          );
        })}

        {/* Not an account, and deliberately shaped like one anyway. Money the
            business holds that nobody has filed is real money, and it belongs
            beside the accounts rather than in a footnote nobody reads. */}
        {unattributed._count > 0 ? (
          <section className="rounded-xl border border-dashed bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <CircleHelp className="h-4 w-4 shrink-0 text-warning" />
                  Unattributed
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Received, but no account named
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                mixed
              </Badge>
            </div>

            <p className="mt-4 font-display text-2xl font-bold tabular-nums">
              {formatUsd(unattributedUsd)}
            </p>
            <p className="text-xs text-muted-foreground">
              across {unattributed._count} payment
              {unattributed._count === 1 ? "" : "s"}
            </p>

            <p className="mt-4 text-xs text-muted-foreground">
              This is money the business has. It simply has no address yet —
              open the payment and say which account it went into, and it moves
              out of here on its own.
            </p>
            <Link
              href="/app/finance/payments"
              className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
            >
              Find them on the payments register
            </Link>
          </section>
        ) : null}
      </div>

      {/* Below the balances, because these are things you do TO the accounts,
          and the accounts themselves are what somebody came here to read. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TransferPanel accounts={treasuryAccounts} />

        <div className="space-y-6">
          <CashCountPanel accounts={treasuryAccounts} expected={expectedCash} />

          {counts.length > 0 ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="border-b px-5 py-4 font-semibold">Recent counts</h2>
              <ul className="divide-y">
                {counts.map((count) => {
                  const diff = toNumber(count.variance);
                  return (
                    <li
                      key={count.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p>
                          {count.account.name} —{" "}
                          {formatMoney(count.countedAmount, count.account.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {count.countedBy?.name ?? "—"} ·{" "}
                          {formatRelative(count.countedAt)}
                          {count.note ? ` · ${count.note}` : ""}
                        </p>
                      </div>
                      {/* A difference is stated, never absorbed. It stays on
                          the record until somebody explains it. */}
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          diff === 0
                            ? "text-success"
                            : diff < 0
                              ? "text-destructive"
                              : "text-warning"
                        }`}
                      >
                        {diff === 0
                          ? "matched"
                          : `${diff > 0 ? "over" : "short"} ${formatMoney(
                              Math.abs(diff),
                              count.account.currency
                            )}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
