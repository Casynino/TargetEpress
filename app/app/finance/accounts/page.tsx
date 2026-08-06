import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CircleHelp,
  Smartphone,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { TreasuryActions } from "@/components/app/treasury-panels";
import { financeTabs } from "@/lib/finance-tabs";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Accounts" };

const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

/** Kind, carried as colour rather than another line of text. */
const KIND_SPINE = {
  BANK: "bg-gradient-to-r from-brand to-info",
  MOBILE_MONEY: "bg-gradient-to-r from-signal to-warning",
  CASH: "bg-gradient-to-r from-success to-brand",
} as const;

const KIND_CHIP = {
  BANK: "bg-brand/10 text-brand",
  MOBILE_MONEY: "bg-signal/10 text-signal",
  CASH: "bg-success/10 text-success",
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

  const [accounts, balances, unattributed, rateRow, counts] = await Promise.all([
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
    currentRate(),
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

  const rate = rateRow ? toNumber(rateRow.rate) : null;
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

      <TreasuryActions accounts={treasuryAccounts} expected={expectedCash} />

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

      {/* The position, in shillings, as one band rather than four flat cells.
          It was a hairline strip of dollar figures on a page whose every other
          number had moved to shillings. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6 rounded-2xl border bg-card p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Across every account
          </p>
          <p className="mt-2 font-display text-[36px] font-bold leading-none tracking-tight tabular-nums">
            {rate ? (
              <>
                <span className="text-lg font-semibold text-muted-foreground">
                  TSh{" "}
                </span>
                {Math.round(totalUsd * rate).toLocaleString("en-US")}
              </>
            ) : (
              formatUsd(totalUsd)
            )}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {formatUsd(totalUsd)} on the invoice rate · six accounts, one
            currency each
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">Accounts in use</dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {accounts.filter((a) => a.active).length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">With movement</dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {rows.filter((r) => r.entries > 0).length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Movements</dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              <Link
                href="/app/finance/transactions"
                className="hover:text-brand"
              >
                {rows.reduce((sum, row) => sum + row.entries, 0)}
              </Link>
            </dd>
          </div>
        </dl>
      </div>

      {/* Money the business holds that has not reached an account. Stated as a
          job above the accounts rather than as a seventh card among them: it
          is not an account, and shaped like one it sat alone in a row of three
          looking like a layout fault. */}
      {unattributed._count > 0 ? (
        <Link
          href="/app/finance/payments"
          className="focus-ring mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-warning/40 bg-warning/5 px-5 py-3.5 transition-colors hover:bg-warning/10"
        >
          <CircleHelp className="h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {unattributed._count} payment
              {unattributed._count === 1 ? "" : "s"} not in any account
            </span>
            <span className="block text-xs text-muted-foreground">
              Money we hold with no address yet — open it and say where it went
            </span>
          </span>
          <span className="text-right">
            <span className="block font-display text-lg font-bold tabular-nums">
              {rate
                ? `TSh ${Math.round(unattributedUsd * rate).toLocaleString("en-US")}`
                : formatUsd(unattributedUsd)}
            </span>
            {rate ? (
              <span className="block font-mono text-[11px] text-muted-foreground">
                {formatUsd(unattributedUsd)}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-xs font-medium text-brand">
            Fix it →
          </span>
        </Link>
      ) : null}

      {/* The accounts themselves.
          Each was a flat grey box repeating "no opening balance set · USD 0.00"
          — the same sentence the banner above already says, six times over,
          under two boxed In/Out cells that were empty on five of them.
          Now: the institution reads first, the balance is the object, and an
          account with nothing in it says so once and quietly. Kind is carried
          by a coloured spine rather than another line of text. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ account, inflow, outflow, net, netUsd, entries, lastMovedAt }) => {
          const Icon = KIND_ICON[account.kind];
          const live = entries > 0;
          return (
            <Link
              key={account.id}
              href={`/app/finance/accounts/${account.id}`}
              className={`focus-ring group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:border-foreground/20 hover:shadow-lift ${
                account.active ? "" : "opacity-60"
              }`}
            >
              {/* A coloured spine says what kind of account this is without
                  spending a line of text on the word. */}
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-1 ${KIND_SPINE[account.kind]}`}
              />

              <div className="flex items-start justify-between gap-3 p-5 pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${KIND_CHIP[account.kind]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold leading-tight">
                      {account.kind === "BANK"
                        ? (account.institution ?? account.name)
                        : account.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {account.accountNumber ?? KIND_LABEL[account.kind]}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                  {account.currency === "TZS" ? "TSh" : account.currency}
                </Badge>
              </div>

              <div className="p-5 pt-4">
                <p className="font-display text-[28px] font-bold leading-none tracking-tight tabular-nums">
                  {formatMoney(net, account.currency)}
                </p>
                {account.currency === "USD" || !live ? null : (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {formatUsd(netUsd)}
                  </p>
                )}
              </div>

              <div className="mt-auto border-t px-5 py-3">
                {live ? (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-success">
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                      {formatMoney(inflow, account.currency)}
                    </span>
                    {outflow > 0 ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        {formatMoney(outflow, account.currency)}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {entries} movement{entries === 1 ? "" : "s"}
                      {lastMovedAt ? ` · ${formatRelative(lastMovedAt)}` : ""}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No movement yet
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>


      {counts.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b px-5 py-3.5 font-semibold">Recent cash counts</h2>
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
                  {/* A difference is stated, never absorbed. It stays on the
                      record until somebody explains it. */}
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
    </>
  );
}
