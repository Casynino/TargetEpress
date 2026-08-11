import Link from "next/link";
import type { Metadata } from "next";
import { CircleHelp, TriangleAlert } from "lucide-react";

import { AccountCard } from "@/components/app/account-card";
import { OpeningBalanceForm } from "@/components/app/opening-balance";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { TreasuryActions } from "@/components/app/treasury-panels";
import { financeTabs } from "@/lib/finance-tabs";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

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
  const locale = await viewerLocale();
  const canManageAccounts = can(user.role, "account.manage");

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
  // Accounts holding money, biggest first; the empty ones are listed after,
  // compactly. Six equal cards where four said "TSh 0 · no movement yet" gave
  // two-thirds of the page to nothing and made the account holding TSh 357,615
  // look no more important than one holding nothing at all.
  // Every account, always — an empty M-Pesa till is a different fact from no
  // M-Pesa till, and this page has to be able to say both. Funded first so the
  // money leads the eye; nothing is dropped to achieve that.
  const ordered = [...rows].sort((a, c) => {
    const fundedFirst = (c.entries > 0 ? 1 : 0) - (a.entries > 0 ? 1 : 0);
    return fundedFirst !== 0 ? fundedFirst : c.netUsd - a.netUsd;
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

      <TreasuryActions accounts={treasuryAccounts} expected={expectedCash} />

      {/* The warning carries its own fix. A caveat nobody can act on teaches
          people to scroll past caveats. */}
      {needsOpening.length > 0 ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
            <span className="font-medium">
              {t(locale, "These are movements recorded here, not balances.")}
            </span>
            <span className="text-muted-foreground">
              {needsOpening.length === accounts.filter((a) => a.active).length
                ? t(locale, "No account has an opening balance yet")
                : `${needsOpening.length} ${
                    needsOpening.length === 1
                      ? t(locale, "account")
                      : t(locale, "accounts")
                  } ${t(locale, "without one")}`}
              {t(locale, ", so whatever was already in the account is not counted.")}
            </span>
          </p>
          {canManageAccounts ? (
            <OpeningBalanceForm
              accounts={needsOpening.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
              }))}
            />
          ) : (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {t(
                locale,
                "Setting them is the CEO’s — it moves every total on this page."
              )}
            </p>
          )}
        </div>
      ) : null}

      {/* The position, in shillings, as one band rather than four flat cells.
          It was a hairline strip of dollar figures on a page whose every other
          number had moved to shillings. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6 rounded-2xl border bg-card p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t(locale, "Across every account")}
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
            {formatUsd(totalUsd)}{" "}
            {t(locale, "on the invoice rate · six accounts, one currency each")}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              {t(locale, "Accounts in use")}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {accounts.filter((a) => a.active).length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t(locale, "With movement")}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {rows.filter((r) => r.entries > 0).length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t(locale, "Movements")}
            </dt>
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
              {unattributed._count}{" "}
              {unattributed._count === 1
                ? t(locale, "payment")
                : t(locale, "payments")}{" "}
              {t(locale, "not in any account")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                locale,
                "Money we hold with no address yet — open it and say where it went"
              )}
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
            {t(locale, "Fix it →")}
          </span>
        </Link>
      ) : null}

      {/* Every account, funded first. Each is drawn as the thing it represents
          — a card — with the institution and its mark at the top, the balance
          as the object of the surface, and the account number set the way it
          is read aloud and checked against a statement. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((row) => (
          <AccountCard
            key={row.account.id}
            id={row.account.id}
            name={row.account.name}
            institution={row.account.institution}
            accountNumber={row.account.accountNumber}
            kind={row.account.kind}
            currency={row.account.currency}
            active={row.account.active}
            net={row.net}
            netUsd={row.netUsd}
            inflow={row.inflow}
            outflow={row.outflow}
            entries={row.entries}
            lastMovedAt={row.lastMovedAt}
          />
        ))}
      </div>

      {counts.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b px-5 py-3.5 font-semibold">
            {t(locale, "Recent cash counts")}
          </h2>
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
                      ? t(locale, "matched")
                      : `${diff > 0 ? t(locale, "over") : t(locale, "short")} ${formatMoney(
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
