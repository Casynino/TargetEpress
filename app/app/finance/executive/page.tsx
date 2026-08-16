import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Paperclip,
  Scale,
  Search,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { ExecutiveForm } from "@/components/app/executive-form";
import { FinanceNav } from "@/components/app/finance-nav";
import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { activeAccounts } from "@/lib/accounts";
import { executiveEntries, executiveSummary } from "@/lib/executive";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { formatShillings, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Executive account" };

/**
 * The executive account.
 *
 * Money the company has advanced for executive use, and money paid back
 * against it. It used to be recorded as an expense called "BOSS" sitting
 * inside office overhead, which did two bad things at once: it reduced the
 * profit the business is judged on, and it hid the only figure that actually
 * matters here — what the account stands at today.
 *
 * Nothing is hidden. Every movement writes a line to the same general ledger
 * as everything else, so the bank position stays right, and every one carries
 * who recorded it and why. What changed is that it is no longer mixed into the
 * cost of running the business, and it is behind a permission: a running
 * balance between the company and its director is not the business of the
 * warehouse floor.
 */
export default async function ExecutiveAccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    direction?: string;
    q?: string;
    from?: string;
    to?: string;
    voided?: string;
  }>;
}) {
  const user = await requirePermission("executive.view");
  const locale = await viewerLocale();
  const canRecord = can(user.role, "executive.record");
  const params = await searchParams;

  const direction =
    params.direction === "DRAW" || params.direction === "RETURN"
      ? params.direction
      : null;
  const search = (params.q ?? "").trim();
  const includeVoid = params.voided === "1";
  const asDate = (v?: string) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const from = asDate(params.from);
  const to = (() => {
    const d = asDate(params.to);
    if (!d) return null;
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    return end;
  })();

  const [summary, entries, accounts] = await Promise.all([
    executiveSummary(),
    executiveEntries({ direction, q: search || null, from, to, includeVoid }),
    activeAccounts(),
  ]);

  const rate = summary.rate;
  const money = (usd: number) => formatShillings(usd, rate);

  const link = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      direction: direction ?? undefined,
      q: search || undefined,
      from: params.from,
      to: params.to,
      voided: includeVoid ? "1" : undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/app/finance/executive${s ? `?${s}` : ""}`;
  };

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";

  return (
    <>
      <PageHeader
        title={t(locale, "Executive account")}
        description={t(
          locale,
          "Company money advanced for executive use, and what has been paid back against it. Kept out of operating costs so a withdrawal cannot make a good month read as a poor one — and written to the general ledger like every other movement of cash."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* The three figures the account exists to answer. */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoneyTile
          label="Total withdrawn"
          usd={summary.withdrawnUsd}
          rate={rate}
          tone="bad"
          icon={ArrowUpRight}
          count={`${summary.draws} ${t(locale, summary.draws === 1 ? "withdrawal" : "withdrawals")}`}
          hint="Everything taken out, since the account opened."
        />
        <MoneyTile
          label="Total returned"
          usd={summary.returnedUsd}
          rate={rate}
          tone="good"
          icon={ArrowDownLeft}
          count={`${summary.returns} ${t(locale, summary.returns === 1 ? "repayment" : "repayments")}`}
          hint="Everything paid back against it."
        />
        <MoneyTile
          label={
            summary.balanceUsd >= 0 ? "Currently owed to the company" : "Company owes"
          }
          usd={Math.abs(summary.balanceUsd)}
          rate={rate}
          tone={summary.balanceUsd > 0 ? "warn" : "good"}
          icon={Scale}
          emphasis={summary.balanceUsd > 0}
          count={
            summary.lastMovementAt
              ? `${t(locale, "last movement")} ${formatDate(summary.lastMovementAt, locale)}`
              : t(locale, "no movements yet")
          }
          hint="Withdrawn less returned. Derived from the register below, never stored."
        />
      </div>

      {/* This month, said plainly. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-3.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(locale, "This month")}
        </span>
        <span>
          {t(locale, "Taken out")}{" "}
          <span className="font-semibold tabular-nums text-destructive">
            {money(summary.withdrawnThisMonthUsd)}
          </span>
        </span>
        <span>
          {t(locale, "Paid back")}{" "}
          <span className="font-semibold tabular-nums text-success">
            {money(summary.returnedThisMonthUsd)}
          </span>
        </span>
        {rate ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            USD 1 = TSh {rate.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>

      {canRecord ? (
        <>
          <SectionLabel>{t(locale, "Record a movement")}</SectionLabel>
          <div className="mb-6">
            <ExecutiveForm
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
              }))}
            />
          </div>
        </>
      ) : null}

      <SectionLabel>{t(locale, "History")}</SectionLabel>

      <form
        method="get"
        className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        <div className="relative min-w-[15rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={search}
            placeholder={t(locale, "A reason, a note, a number…")}
            className="h-9 w-full pl-9 text-sm"
            aria-label={t(locale, "Search the register")}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t(locale, "From")}
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t(locale, "To")}
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
          />
        </label>
        {direction ? (
          <input type="hidden" name="direction" value={direction} />
        ) : null}
        {includeVoid ? <input type="hidden" name="voided" value="1" /> : null}
        <button
          type="submit"
          className="focus-ring h-9 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"
        >
          {t(locale, "Search")}
        </button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[
          { key: null, label: "Everything" },
          { key: "DRAW" as const, label: "Withdrawals" },
          { key: "RETURN" as const, label: "Repayments" },
        ].map((option) => (
          <Link
            key={option.key ?? "all"}
            href={link({ direction: option.key ?? undefined })}
            aria-current={direction === option.key ? "true" : undefined}
            className={cn(
              chip,
              direction === option.key
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t(locale, option.label)}
          </Link>
        ))}
        <Link
          href={link({ voided: includeVoid ? undefined : "1" })}
          className={cn(
            chip,
            includeVoid
              ? "border-foreground/25 bg-accent text-foreground"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {t(locale, includeVoid ? "Hiding nothing" : "Show cancelled too")}
        </Link>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing on this account yet")}
          description={t(
            locale,
            "When company money is taken for executive use, record it here rather than as an office cost — it keeps the profit figure honest and the balance visible."
          )}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <ul className="divide-y">
            {entries.map((entry) => {
              const draw = entry.direction === "DRAW";
              const cancelled = Boolean(entry.voidedAt);
              return (
                <li
                  key={entry.id}
                  className={cn("px-4 py-3", cancelled && "opacity-60")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {draw ? (
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-destructive" />
                        ) : (
                          <ArrowDownLeft className="h-4 w-4 shrink-0 text-success" />
                        )}
                        <span className={cancelled ? "line-through" : ""}>
                          {entry.reason}
                        </span>
                        {cancelled ? (
                          <Badge
                            variant="outline"
                            className="font-normal text-muted-foreground"
                          >
                            {t(locale, "Cancelled")}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{entry.entryNumber}</span>
                        <span>·</span>
                        <span>{formatDate(entry.occurredAt, locale)}</span>
                        <span>·</span>
                        <span>
                          {draw ? t(locale, "from") : t(locale, "into")}{" "}
                          {entry.account.name}
                        </span>
                        {entry.recordedBy ? (
                          <>
                            <span>·</span>
                            <span>
                              {t(locale, "recorded by")} {entry.recordedBy.name}
                            </span>
                          </>
                        ) : null}
                        {entry.receipts.length > 0 ? (
                          <>
                            <span>·</span>
                            <a
                              href={entry.receipts[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-brand"
                            >
                              <Paperclip className="h-3 w-3" />
                              {entry.receipts.length === 1
                                ? t(locale, "attachment")
                                : `${entry.receipts.length} ${t(locale, "attachments")}`}
                            </a>
                          </>
                        ) : null}
                      </p>
                      {entry.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.note}
                        </p>
                      ) : null}
                      {cancelled ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(locale, "Cancelled")}
                          {entry.voidedBy ? ` ${t(locale, "by")} ${entry.voidedBy.name}` : ""}
                          {entry.voidReason ? `: ${entry.voidReason}` : ""}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold tabular-nums",
                          cancelled
                            ? "text-muted-foreground line-through"
                            : draw
                              ? "text-destructive"
                              : "text-success"
                        )}
                      >
                        {draw ? "−" : "+"}{" "}
                        {formatMoney(entry.amount, entry.currency)}
                      </p>
                      {entry.currency === "USD" ? null : (
                        <p className="text-xs text-muted-foreground">
                          {formatUsd(toNumber(entry.amountUsd))}
                        </p>
                      )}
                      {/* What the account stood at after this movement — the
                          column that makes a register checkable line by line. */}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t(locale, "balance")}{" "}
                        <span className="tabular-nums">
                          {money(entry.balanceAfterUsd)}
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
