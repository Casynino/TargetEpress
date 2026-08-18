import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Info,
  PlaneLanding,
  Smartphone,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { formatDate, formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings, formatUsd } from "@/lib/money";
import { can } from "@/lib/rbac";
import { reconciliation, type Check, type CheckSide } from "@/lib/reconciliation";
import { requirePermission } from "@/lib/session";
import { statementSummary, submittedStatements } from "@/lib/statements";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reconciliation" };

/** The mark each kind of account carries everywhere else in the app. */
const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

/**
 * A money side, in the currency this office counts in.
 *
 * The engine hands over the dollar figure AND the dollar string; the screen
 * leads in shillings and keeps the dollars as small print underneath, which is
 * what every other money screen here does. Doing it in one place rather than at
 * each row is the difference between this rule holding and this rule being a
 * ternary somebody forgets on the next row they add.
 */
function sideText(side: CheckSide, rate: number | null) {
  return side.usd === undefined ? side.value : formatShillings(side.usd, rate);
}

/** One small labelled figure. The unit of density on this page. */
function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bad" | "warn";
}) {
  return (
    <span>
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          tone === "bad"
            ? "tabular text-sm font-semibold text-destructive"
            : tone === "warn"
              ? "tabular text-sm font-semibold text-warning"
              : "tabular text-sm font-semibold"
        }
      >
        {value}
      </span>
      {sub ? (
        <span className="tabular block text-[10px] text-muted-foreground">{sub}</span>
      ) : null}
    </span>
  );
}

/**
 * One question, asked twice, with both answers adjacent.
 *
 * Shared by the integrity checks and the collections ones because they ARE the
 * same object — a second row component would drift in a fortnight and the page
 * would look like it was reporting two different kinds of finding when it is
 * reporting one.
 */
function CheckRow({
  check,
  locale,
  rate,
  children,
}: {
  check: Check;
  locale: Locale;
  rate: number | null;
  children?: React.ReactNode;
}) {
  /* Failing beats explained. A check can be both — two payments really are off
     the register AND the reason is known — and dressing that row in the calm
     blue of a footnote because it happens to carry an explanation is how a
     fault gets read as a remark. The note still renders below; only the row's
     face follows the verdict. */
  const Icon = !check.ok ? TriangleAlert : check.expected ? Info : CheckCircle2;
  const tone = !check.ok
    ? "text-destructive"
    : check.expected
      ? "text-info"
      : "text-success";

  return (
    <div
      className={
        check.ok
          ? "rounded-xl border bg-card p-3"
          : "rounded-xl border border-destructive/40 bg-destructive/[0.03] p-3"
      }
    >
      <div className="flex items-start gap-2.5">
        <IconHint
          className="mt-0.5 shrink-0"
          label={
            !check.ok
              ? t(locale, "These two do not agree")
              : check.expected
                ? t(locale, "Agrees, with a note")
                : t(locale, "Agrees")
          }
        >
          <Icon className={`h-4 w-4 ${tone}`} />
        </IconHint>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(locale, check.label)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t(locale, check.question)}
          </p>

          {/* Both answers, adjacent, so the gap is read rather than calculated.
              Tabular figures because the eye compares columns of digits, not
              sentences. */}
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <Figure
              label={t(locale, check.left.label)}
              value={sideText(check.left, rate)}
              sub={
                check.left.usd !== undefined && rate !== null
                  ? check.left.value
                  : undefined
              }
            />
            <Figure
              label={t(locale, check.right.label)}
              value={sideText(check.right, rate)}
              sub={
                check.right.usd !== undefined && rate !== null
                  ? check.right.value
                  : undefined
              }
              tone={check.ok ? undefined : "bad"}
            />
            {check.href ? (
              <Link
                href={check.href}
                className="focus-ring ml-auto inline-flex items-center gap-1 rounded text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {t(locale, "Open")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {check.expected ? (
            <p className="mt-2 border-l-2 border-info/40 pl-2 text-[11px] text-muted-foreground">
              {t(locale, check.expected)}
            </p>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The books against the accounts.
 *
 * Read top to bottom: each row is one question asked twice by different routes,
 * with both answers side by side. The clean rows earn their place — a page that
 * showed only faults could not distinguish "we checked and it agrees" from "we
 * did not check", and those are the two states a manager most needs told apart
 * before signing anything off.
 *
 * The flights waiting on a sign-off sit above them for that last clause. A
 * statement is the one thing on this desk that BLOCKS somebody else — Finance
 * cannot finish a flight until it is ruled on — and until now it appeared on no
 * screen the manager opens, so it could sit for a fortnight without anybody
 * being told. It is a short queue by nature, so it costs the checks below
 * almost nothing and it is the first thing read.
 *
 * Then the two sections that turn a list of checks into a reconciliation.
 *
 * WHERE THE MONEY SITS is the position: every live account, grouped by what it
 * is, with what went in, what went out and what is left. It is not a check and
 * is not dressed as one — for a bank or a mobile-money float this system holds
 * no second side to compare against, because nothing imports a statement, and
 * each group says so in its own words rather than letting a reader assume the
 * ledger has been verified against something. The cash tins are the exception
 * and they say that too: they get physically counted, and the count is printed
 * with the difference it found.
 *
 * COLLECTIONS is the same two-route discipline as the checks above, applied to
 * money owed: what Support is chasing against what the books call receivable,
 * the chase list against the invoice book, claims waiting on Finance counted
 * from either end. Both engines already answer these for their own desks; this
 * page only sets the answers beside each other.
 */
export default async function ManagerReconciliation() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const [
    { checks, negative, positions, archivedHolding, collections },
    waiting,
    rateRow,
  ] = await Promise.all([reconciliation(locale), submittedStatements(), currentRate()]);
  const summary = await statementSummary(waiting);
  /* Fallback only. Each statement carries the rate it was closed at, and that
     is what its own row converts with; today's rate is for the total across
     several of them, and for a statement closed before any rate was published. */
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const faults =
    checks.filter((c) => !c.ok).length +
    collections.checks.filter((c) => !c.ok).length;
  /*
    Finance reaches this page too — report.view, not statement.review — and for
    that desk the same list is not a queue, it is the wait. Only the ruling is
    withheld; seeing what it submitted and how long ago is exactly what stops it
    asking. Same idiom as the approvals board: everybody reads, one desk acts.
  */
  const mine = can(user.role, "statement.review");

  return (
    <>
      <PageHeader
        title={t(locale, "Reconciliation")}
        description={t(
          locale,
          "Each figure asked twice, by two different routes. Where the two answers differ, the difference is here."
        )}
      />

      <p
        className={
          faults > 0
            ? "mb-4 rounded-lg border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-sm font-medium text-destructive"
            : "mb-4 rounded-lg border border-success/40 bg-success/[0.05] px-3 py-2 text-sm font-medium text-success"
        }
      >
        {faults > 0
          ? `${faults} ${t(locale, faults === 1 ? "check disagrees" : "checks disagree")}`
          : t(locale, "Everything agrees. The books and the accounts tell the same story.")}
      </p>

      {/*
        Finance shuts a flight's books; somebody senior agrees them. This is the
        gap between those two facts, and nothing more — no accept, no send-back.
        The ruling stays on the closed-batches sheet, which holds the whole
        statement, the guard on it and the audit row it writes; a second control
        here would be a second path to the same decision, and one of the two
        always ends up missing a check the other has.
      */}
      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-semibold">
            {mine
              ? t(locale, "Flights waiting on you")
              : t(locale, "Flights waiting on a sign-off")}
          </h2>
          {summary.waiting > 0 ? (
            <>
              <span className="tabular text-sm text-muted-foreground">
                {summary.waiting}
              </span>
              {/* Age is the alarm, not the count: one flight nobody has read for
                  a week is worse than four closed this morning. Warning rather
                  than the destructive red the checks below wear — an unread
                  statement is late, not wrong, and the two must not look alike
                  on a page whose other rows mean something has gone astray. */}
              <span
                className={
                  (summary.oldestDays ?? 0) >= 3
                    ? "text-[11px] font-semibold text-warning"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {summary.oldestDays === 0
                  ? t(locale, "oldest today")
                  : `${t(locale, "oldest")} ${summary.oldestDays}${t(locale, "d")}`}
              </span>
              {/*
                Said to be at today's rate, because it is the one figure here
                that is not frozen. Each row converts at the rate its own
                statement was closed at, so a total struck across several of
                them will not add up to the rows underneath — the closed-batches
                sheet answers this by printing no shilling total at all. A
                manager still wants to know how much is sitting unread, so the
                total stays and says which rate produced it.
              */}
              <span className="ml-auto flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, "at today's rate")}
                </span>
                <span className="tabular text-sm font-semibold">
                  {formatShillings(summary.revenueUsd, rate)}
                </span>
                <span className="tabular text-[11px] text-muted-foreground">
                  {t(locale, "profit")} {formatShillings(summary.profitUsd, rate)}
                </span>
              </span>
            </>
          ) : null}
        </div>

        {waiting.length === 0 ? (
          /* One line, not an empty state. The checks below are the page. */
          <p className="text-[11px] text-muted-foreground">
            {t(
              locale,
              "Nothing closed is waiting. Every flight Finance has shut has been read and agreed."
            )}
          </p>
        ) : (
          <ul className="space-y-2">
            {waiting.map((row) => {
              const stale = row.waitingDays >= 3;
              /* Shillings at the rate the statement was frozen at, so this row
                 shows the figure that will still be on it when it is signed —
                 today's rate is only for the flights closed before any was
                 published. */
              const at = row.rate ?? rate;
              return (
                <li
                  key={row.batchId}
                  className={
                    stale
                      ? "rounded-xl border border-warning/40 bg-warning/[0.03] p-3"
                      : "rounded-xl border bg-card p-3"
                  }
                >
                  <div className="flex items-start gap-2.5">
                    <IconHint
                      className="mt-0.5 shrink-0"
                      label={t(locale, "Closed, waiting to be agreed")}
                    >
                      <PlaneLanding
                        className={
                          stale ? "h-4 w-4 text-warning" : "h-4 w-4 text-muted-foreground"
                        }
                      />
                    </IconHint>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        {/* The flight itself: its cargo, its costs, its close
                            note. The evidence, not the decision. */}
                        <Link
                          href={`/app/shipments/${row.batchId}`}
                          className="focus-ring rounded text-sm font-semibold underline-offset-2 hover:underline"
                        >
                          {row.batchNumber}
                        </Link>
                        {row.flight ? (
                          <span className="text-[11px] text-muted-foreground">
                            {row.flight}
                          </span>
                        ) : null}
                        <span
                          className={
                            stale
                              ? "text-[11px] font-semibold text-warning"
                              : "text-[11px] text-muted-foreground"
                          }
                        >
                          {row.waitingDays === 0
                            ? t(locale, "closed today")
                            : `${t(locale, "waiting")} ${row.waitingDays}${t(locale, "d")}`}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(locale, "Closed by")}{" "}
                        {row.submittedBy ??
                          row.closedBy ??
                          t(locale, "the system, on its last payment")}
                        {" · "}
                        {formatDate(row.closedAt ?? row.submittedAt, locale)}
                      </p>

                      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                        <Figure
                          label={t(locale, "Worth")}
                          value={formatShillings(row.revenueUsd, at)}
                        />
                        <Figure
                          label={t(locale, "Costs")}
                          value={formatShillings(row.expensesUsd, at)}
                        />
                        {/* A flight that lost money is the one worth opening,
                            so it is the one figure that changes colour. */}
                        <Figure
                          label={t(locale, "Profit")}
                          value={
                            row.profitUsd === null
                              ? "—"
                              : formatShillings(row.profitUsd, at)
                          }
                          tone={
                            row.profitUsd !== null && row.profitUsd < 0
                              ? "bad"
                              : undefined
                          }
                        />
                        <Figure label={t(locale, "Kg")} value={row.kg.toFixed(1)} />

                        {/*
                          Straight onto the row that carries the accept and the
                          send-back, filtered to this one flight. Withheld from a
                          reader who cannot rule — the batch link above still
                          opens the flight, because reading it is not the ruling.
                        */}
                        {mine ? (
                          <Link
                            href={`/app/finance/income?status=SUBMITTED&q=${encodeURIComponent(row.batchNumber)}`}
                            className="focus-ring ml-auto inline-flex items-center gap-1 rounded text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {t(locale, "Read the statement")}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        {checks.map((c) => (
          <CheckRow key={c.key} check={c} locale={locale} rate={rate}>
            {/* The specific accounts, not just the count. A manager told "one
                account is negative" then has to go and find it. */}
            {c.key === "negative" && negative.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {negative.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="tabular shrink-0 text-destructive">
                      {a.balance.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {a.currency}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CheckRow>
        ))}
      </div>

      {/*
        WHERE THE MONEY SITS.

        Every figure below is accountBalances() as it stands — the same rows the
        Accounts page draws its cards from. Balances print in each account's own
        currency rather than through formatShillings, and that is deliberate:
        five of these accounts already hold shillings, so converting the ledger's
        dollar column at today's rate would run those balances out through the
        rate in force when each line was posted and back in at the current one.
        The Accounts page learned that the hard way — a headline that moved on
        the morning a new rate was published while the cards under it did not.
        The dollar figure stays as small print, on the account's own frozen rate.

        Subtotals are per currency for the same reason: the banks hold both
        shillings and dollars, and one number across them would need a rate this
        page has no business choosing.
      */}
      <section className="mt-5">
        <SectionLabel action={{ href: "/app/finance/accounts", label: t(locale, "Accounts") }}>
          {t(locale, "Where the money sits")}
        </SectionLabel>

        <div className="space-y-2">
          {positions.map((group) => {
            const Icon = KIND_ICON[group.kind];
            return (
              <div key={group.kind} className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <IconHint className="shrink-0 self-center" label={t(locale, group.label)}>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </IconHint>
                  <h3 className="text-sm font-semibold">{t(locale, group.label)}</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {group.accounts.length}{" "}
                    {t(locale, group.accounts.length === 1 ? "account" : "accounts")}
                    {" · "}
                    {group.entries} {t(locale, "movements")}
                  </span>
                  <span className="ml-auto flex flex-wrap items-baseline gap-x-3">
                    {group.totals.map((total) => (
                      <span
                        key={total.currency}
                        className="tabular text-sm font-semibold"
                      >
                        {formatMoney(total.balance, total.currency)}
                      </span>
                    ))}
                  </span>
                </div>

                {/* The honest line. A group with no second side says so here, in
                    the same place a group that HAS one says what it is checked
                    against — so a reader never has to assume. */}
                <p
                  className={
                    group.checkable
                      ? "mt-1 text-[11px] text-muted-foreground"
                      : "mt-1 border-l-2 border-info/40 pl-2 text-[11px] text-muted-foreground"
                  }
                >
                  {t(locale, group.counterpart)}
                </p>

                <ul className="mt-2 divide-y">
                  {group.accounts.map((account) => {
                    const short = account.count && account.count.variance < -0.005;
                    const over = account.count && account.count.variance > 0.005;
                    return (
                      <li
                        key={account.id}
                        className="flex flex-wrap items-end gap-x-5 gap-y-1 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 flex-1 basis-44 self-center">
                          <Link
                            href={`/app/finance/accounts/${account.id}`}
                            className="focus-ring rounded text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {account.name}
                          </Link>
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {account.currency === "TZS" ? "TSh" : account.currency}
                          </span>
                          {/* The same distinction the check above draws, on the
                              row it applies to: this is money that moved through
                              here, not what the account holds. */}
                          {account.openingSetAt === null ? (
                            <span className="ml-1.5 text-[10px] text-warning">
                              {t(locale, "movements only — no opening balance set")}
                            </span>
                          ) : null}
                        </span>

                        <Figure
                          label={t(locale, "In")}
                          value={formatMoney(account.inflow, account.currency)}
                        />
                        <Figure
                          label={t(locale, "Out")}
                          value={formatMoney(account.outflow, account.currency)}
                        />
                        <Figure
                          label={t(locale, "Balance")}
                          value={formatMoney(account.balance, account.currency)}
                          sub={
                            account.currency !== "USD" && account.entries > 0
                              ? formatUsd(account.balanceUsd)
                              : undefined
                          }
                          tone={account.balance < -0.005 ? "bad" : undefined}
                        />
                        <Figure
                          label={t(locale, "Movements")}
                          value={String(account.entries)}
                          sub={
                            account.lastMovedAt
                              ? formatRelative(account.lastMovedAt, locale)
                              : t(locale, "nothing yet")
                          }
                        />

                        {/* The count, on its own line under the account it
                            belongs to. Only cash has one — see the group note. */}
                        {account.count ? (
                          <p className="basis-full text-[11px] text-muted-foreground">
                            {t(locale, "Counted")}{" "}
                            {formatDate(account.count.countedAt, locale)}
                            {account.count.countedBy
                              ? ` ${t(locale, "by")} ${account.count.countedBy}`
                              : ""}
                            {" · "}
                            {formatMoney(account.count.countedAmount, account.currency)}{" "}
                            {t(locale, "against")}{" "}
                            {formatMoney(account.count.expectedAmount, account.currency)}{" "}
                            {t(locale, "expected")}
                            {" · "}
                            {short || over ? (
                              <span
                                className={
                                  short
                                    ? "font-semibold text-destructive"
                                    : "font-semibold text-warning"
                                }
                              >
                                {short ? t(locale, "short by") : t(locale, "over by")}{" "}
                                {formatMoney(
                                  Math.abs(account.count.variance),
                                  account.currency
                                )}
                              </span>
                            ) : (
                              <span className="text-success">
                                {t(locale, "and it agreed")}
                              </span>
                            )}
                          </p>
                        ) : group.checkable ? (
                          <p className="basis-full text-[11px] text-muted-foreground">
                            {t(
                              locale,
                              "Never counted, so nothing has been held against this tin."
                            )}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* Money in an account nobody uses any more is money the position
              above does not count. Folding it in would overstate the live
              position; leaving it unsaid would lose it. */}
          {archivedHolding.length > 0 ? (
            <p className="rounded-xl border border-warning/40 bg-warning/[0.03] p-3 text-[11px] text-muted-foreground">
              <span className="font-semibold text-warning">
                {t(locale, "Closed accounts still holding money.")}
              </span>{" "}
              {archivedHolding
                .map((a) => `${a.name} — ${formatMoney(a.balance, a.currency)}`)
                .join(" · ")}
              {". "}
              {t(
                locale,
                "These are not in the totals above, because they are not accounts the business uses. Empty them or reopen them."
              )}
            </p>
          ) : null}
        </div>
      </section>

      {/*
        COLLECTIONS.

        The band states the period's book from financeDashboard, then the rows
        below check it from both ends. Nothing here re-reads an invoice: Support
        already counts what it is chasing and the finance dashboard already
        groups the book by status, so this page's only job is to set the two
        answers beside each other and say whether they agree.
      */}
      <section className="mt-5">
        <SectionLabel action={{ href: "/app/finance/invoices", label: t(locale, "Bills") }}>
          {t(locale, "Collections")}
        </SectionLabel>

        <div className="rounded-xl border bg-card p-3">
          <p className="text-sm font-semibold">
            {t(locale, "Billed in")} {collections.periodLabel}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <Figure
              label={t(locale, "Billed")}
              value={formatShillings(collections.billed.expectedUsd, rate)}
              sub={rate === null ? undefined : formatUsd(collections.billed.expectedUsd)}
            />
            <Figure
              label={t(locale, "Settled")}
              value={formatShillings(collections.billed.collectedUsd, rate)}
              sub={rate === null ? undefined : formatUsd(collections.billed.collectedUsd)}
            />
            <Figure
              label={t(locale, "Still owed on them")}
              value={formatShillings(collections.billed.outstandingUsd, rate)}
              sub={rate === null ? undefined : formatUsd(collections.billed.outstandingUsd)}
              tone={collections.billed.outstandingUsd > 0.005 ? "warn" : undefined}
            />
            <Figure
              label={t(locale, "Collection rate")}
              value={
                collections.billed.rate === null ? "—" : `${collections.billed.rate}%`
              }
            />
          </div>

          {/* The whole book, not just this period's — the figure Support works
              from every morning, and the one a manager is actually asked about. */}
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2 border-t pt-2">
            <Figure
              label={t(locale, "Owed across every live bill")}
              value={formatShillings(collections.book.outstandingUsd, rate)}
              sub={rate === null ? undefined : formatUsd(collections.book.outstandingUsd)}
            />
            <Figure
              label={t(locale, "Bills on the chase list")}
              value={String(collections.book.owingCount)}
              sub={`${collections.book.awaitingPayment} ${t(locale, "sent, unpaid")}`}
            />
            <Figure
              label={t(locale, "Claims waiting")}
              value={String(collections.book.pendingCount)}
              sub={`${collections.book.rejected} ${t(locale, "turned down")}`}
              tone={collections.book.pendingCount > 0 ? "warn" : undefined}
            />
            <Figure
              label={t(locale, "Claims that stood up")}
              value={
                collections.book.successRate === null
                  ? "—"
                  : `${collections.book.successRate}%`
              }
              sub={`${t(locale, "of")} ${collections.book.submitted} ${t(locale, "sent up")}`}
            />
            <Figure
              label={t(locale, "Cleared, still on the floor")}
              value={String(collections.book.notesReady)}
            />
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {collections.checks.map((c) => (
            <CheckRow key={c.key} check={c} locale={locale} rate={rate} />
          ))}
        </div>
      </section>
    </>
  );
}
