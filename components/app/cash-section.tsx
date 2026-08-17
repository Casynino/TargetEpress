import Link from "next/link";


import { ExpenseForm } from "@/components/app/expense-form";
import {
  CashCountPanel,
  TransferPanel,
} from "@/components/app/treasury-panels";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import {
  COMMON_EXPENSES,
} from "@/lib/expenses";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

/**
 * The cash tin, inside Accounts where it belongs.
 *
 * It was a tab of its own, which put the thing the money physically sits in on
 * a different screen from the list of accounts it is one of. The owner's call,
 * and the right one: a till is an account. Everything it does — taking money
 * in, paying something out, counting what is actually there — now sits under
 * the accounts it moves between.
 *
 * The balance is derived from the ledger, never stored. A cash balance written
 * down somewhere is a cash balance that can disagree with its own history;
 * this one cannot, because it IS its history added up.
 */
export async function CashSection() {
  const user = await requirePermission("account.view");
  const locale = await viewerLocale();
  const canMove = can(user.role, "expense.record");

  const [accounts, entries, counts, rate, usedMost] = await Promise.all([
    prisma.companyAccount.findMany({
      where: { active: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        currency: true,
        accountNumber: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { account: { kind: "CASH" } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        entryNumber: true,
        occurredAt: true,
        direction: true,
        kind: true,
        amount: true,
        currency: true,
        description: true,
        reversesId: true,
        account: { select: { id: true, name: true } },
        recordedBy: { select: { name: true } },
        expense: { select: { _count: { select: { receipts: true } } } },
      },
    }),
    prisma.cashCount.findMany({
      orderBy: { countedAt: "desc" },
      take: 6,
      select: {
        id: true,
        countedAt: true,
        countedAmount: true,
        expectedAmount: true,
        variance: true,
        note: true,
        account: { select: { name: true, currency: true } },
        countedBy: { select: { name: true } },
      },
    }),
    currentRateValue(),
    prisma.expense.groupBy({
      by: ["description", "category"],
      where: { status: { not: "VOID" } },
      _count: true,
      orderBy: { _count: { description: "desc" } },
      take: 8,
    }),
  ]);

  const cashAccounts = accounts.filter((a) => a.kind === "CASH");

  /*
    Every cash account's balance, from every line that ever moved through it.

    Not the hundred rows above — those are the recent history for reading. A
    balance built from a truncated list is wrong by exactly what was truncated.
  */
  const allCashLines = await prisma.ledgerEntry.findMany({
    where: { account: { kind: "CASH" } },
    select: { accountId: true, direction: true, amount: true },
  });
  const balances = new Map<string, number>();
  for (const line of allCashLines) {
    const current = balances.get(line.accountId) ?? 0;
    balances.set(
      line.accountId,
      current + (line.direction === "IN" ? toNumber(line.amount) : -toNumber(line.amount))
    );
  }

  const quick = (() => {
    const seen = new Set<string>();
    return [
      ...usedMost.map((r) => ({ label: r.description, category: r.category as string })),
      ...COMMON_EXPENSES,
    ]
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  })();

  /*
    When the tin was last counted, said once rather than per card.

    It is the only thing the removed cards carried that the accounts grid
    above does not, and it belongs to the tin as a whole.
  */
  const newest = counts[0];
  const lastCountLine = newest
    ? `${t(locale, "Last counted")} ${formatDate(newest.countedAt, locale)}${
        toNumber(newest.variance) !== 0
          ? ` · ${t(locale, "was out by")} ${toNumber(newest.variance).toFixed(2)}`
          : ` · ${t(locale, "and it agreed")}`
      }`
    : t(locale, "Never counted");

  return (
    <div className="mt-8">
      {/* The tin's own heading, since this is no longer a page of its own. */}
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold">
          {t(locale, "Office cash")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            locale,
            "What is in the tin, what went through it, and the four things you do to it. The balance is the ledger added up, so it cannot disagree with its own history."
          )}
        </p>
      </div>

      {cashAccounts.length === 0 ? (
        <section className="panel p-5">
          <p className="text-sm text-muted-foreground">
            {t(
              locale,
              "No cash account exists yet. Open one on Accounts and it will appear here."
            )}
          </p>
        </section>
      ) : (
        <>
          {/*
            No balance card here.

            The accounts grid directly above already shows Office cash with its
            balance, and printing it again three inches lower — in a different
            currency spelling, at that — is the page telling you the same thing
            twice and inviting you to wonder which one is right. What is left
            below is only what the grid cannot do: the four actions, and the
            history of what went through the tin.
          */}
          {lastCountLine ? (
            <p className="mb-4 text-xs text-muted-foreground">{lastCountLine}</p>
          ) : null}

          {canMove ? (
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Money in: from a bank or mobile account into the tin. */}
              <TransferPanel accounts={accounts} />
              {/* Money checked: what is physically there against what the
                  ledger believes, and the difference recorded either way. */}
              <CashCountPanel
                accounts={accounts}
                expected={Object.fromEntries(balances)}
              />
            </div>
          ) : null}

          {canMove ? (
            <section className="panel mb-6 overflow-hidden">
              <div className="border-b px-5 py-4">
                <h2 className="font-display font-semibold">
                  {t(locale, "Pay something out of cash")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Choose a cash account and the money leaves the tin as you record it. Attach the receipt here rather than keeping it in a pocket."
                  )}
                </p>
              </div>
              <ExpenseForm
                accounts={cashAccounts}
                quick={quick}
                rate={rate}
                alwaysOpen
              />
            </section>
          ) : null}

          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
              <h2 className="font-display font-semibold">
                {t(locale, "Everything that went through the tin")}
              </h2>
              <Link
                href="/app/finance/reports?report=petty-cash"
                className="text-xs text-muted-foreground underline"
              >
                {t(locale, "Full report")}
              </Link>
            </div>

            {entries.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {t(locale, "Nothing has moved through a cash account yet.")}
              </p>
            ) : (
              <>
              {/* Seven columns, two of them a matched In/Out pair. Below md
                  each entry becomes a card and the amount is signed instead —
                  a pair of columns where one is always blank is the first
                  thing to break when the table has to fit a handset. */}
              <ul className="divide-y md:hidden">
                {entries.map((e) => {
                  const amount = toNumber(e.amount);
                  const isIn = e.direction === "IN";
                  return (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm">
                          {e.description}
                          {e.reversesId ? (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {t(locale, "correction")}
                            </span>
                          ) : null}
                          {e.expense && e.expense._count.receipts === 0 ? (
                            <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                              {t(locale, "no receipt")}
                            </span>
                          ) : null}
                        </p>
                        <p
                          className={`shrink-0 text-sm font-medium tabular-nums ${
                            isIn ? "text-success" : "text-destructive"
                          }`}
                        >
                          {isIn ? "+" : "−"}
                          {amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-mono">{e.entryNumber}</span> ·{" "}
                        {formatDateTime(e.occurredAt, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.account?.name ?? "—"} · {t(locale, "Recorded by")}{" "}
                        {e.recordedBy?.name ?? "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2 font-medium">{t(locale, "Date")}</th>
                      <th className="px-3 py-2 font-medium">{t(locale, "Entry")}</th>
                      <th className="px-3 py-2 font-medium">{t(locale, "Description")}</th>
                      <th className="px-3 py-2 font-medium">{t(locale, "Account")}</th>
                      <th className="px-3 py-2 font-medium">{t(locale, "Recorded by")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t(locale, "In")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t(locale, "Out")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const amount = toNumber(e.amount);
                      const isIn = e.direction === "IN";
                      return (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="px-5 py-2.5 text-xs tabular-nums text-muted-foreground">
                            {formatDateTime(e.occurredAt, locale)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            {e.entryNumber}
                          </td>
                          <td className="px-3 py-2.5">
                            {e.description}
                            {/* A reversal is not a new event; it is an answer to
                                one, and reads wrongly without saying so. */}
                            {e.reversesId ? (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {t(locale, "correction")}
                              </span>
                            ) : null}
                            {e.expense && e.expense._count.receipts === 0 ? (
                              <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                                {t(locale, "no receipt")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {e.account?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {e.recordedBy?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-success">
                            {isIn ? amount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : ""}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-destructive">
                            {isIn ? "" : amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
