import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Landmark, Scale, Smartphone, Wallet, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ReconcileForm } from "@/components/app/reconcile-form";
import { ReconcileNav } from "@/components/app/reconcile-nav";
import { formatMoney, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { accountPositions, reconciliationTabCounts } from "@/lib/reconciliation-workspace";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account checks" };

const ACCOUNT_ICON: Record<string, LucideIcon> = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
};

/**
 * PROVING AN ACCOUNT AGAINST THE WORLD, which is a different job from agreeing
 * the day's records — and now has its own door rather than seven hundred pixels
 * at the top of one.
 *
 * System is what the ledger says, worked out from its own lines and typed by
 * nobody. Actual is what somebody read off a statement, a phone or a till. The
 * page never lets the two words blur, because a screen that mixes them
 * certifies nothing.
 */
export default async function ReconciliationAccounts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const params = await searchParams;
  const canReconcile = can(user.role, "account.reconcile");
  const positions = await accountPositions();

  const never = positions.filter((position) => !position.lastCheck).length;
  const stale = positions.filter((position) => position.movedSinceCheck).length;
  const disagreeing = positions.filter(
    (position) => position.lastCheck && Math.abs(position.lastCheck.difference) >= 0.01
  ).length;
  const withParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return `/app/manager/reconciliation/accounts${query ? `?${query}` : ""}`;
  };

  const tabCounts = await reconciliationTabCounts();

  return (
    <>
      <PageHeader
        title={t(locale, "Account checks")}
        description={t(
          locale,
          "What the ledger says each account holds, and what somebody proved it holds from outside."
        )}
      />
      <ReconcileNav counts={tabCounts} />

      {/* Three readings of the same six accounts, in the colours they mean. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Never checked",
            value: never,
            hint: "nobody has held these against anything outside",
            tone: "warning" as const,
            icon: Scale,
          },
          {
            label: "Moved since the check",
            value: stale,
            hint: "the check no longer describes the account",
            tone: "info" as const,
            icon: Landmark,
          },
          {
            label: "Disagreeing",
            value: disagreeing,
            hint: "the two figures differ and a reason is on the record",
            tone: "destructive" as const,
            icon: Building2,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "rounded-xl border p-4 shadow-soft",
                card.tone === "warning" && "border-warning/30 bg-warning/[0.06]",
                card.tone === "info" && "border-info/30 bg-info/[0.06]",
                card.tone === "destructive" && "border-destructive/30 bg-destructive/[0.06]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">{t(locale, card.label)}</p>
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    card.tone === "warning" && "bg-warning/15 text-warning",
                    card.tone === "info" && "bg-info/15 text-info",
                    card.tone === "destructive" && "bg-destructive/15 text-destructive"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p
                className={cn(
                  "mt-2 font-display text-[28px] font-bold leading-none tabular-nums",
                  card.tone === "warning" && "text-warning",
                  card.tone === "info" && "text-info",
                  card.tone === "destructive" && "text-destructive"
                )}
              >
                {card.value}
              </p>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {t(locale, card.hint)}
              </p>
            </div>
          );
        })}
      </div>

        <div className="rounded-xl border bg-card p-4 shadow-soft">
        <p className="text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "System is what the ledger says, worked out from its own lines. Actual is what somebody proved from outside it — a statement, a phone, a till count."
          )}
        </p>

        {/*
          ONE LINE PER ACCOUNT, and the column names said once.

          The first cut of this gave every account a block of its own with the
          same sentence under each — six accounts, seven hundred pixels, and
          the actual work pushed below the fold. The owner has thrown that
          shape out twice on other screens. A row states the three figures
          under one header; the form to record a real balance opens inside the
          row that needs it.
        */}
        <div className="mt-3 overflow-hidden rounded-lg border">
          <div className="hidden border-b bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_5rem] sm:gap-3">
            <span>{t(locale, "Account")}</span>
            <span className="text-right">{t(locale, "System")}</span>
            <span className="text-right">{t(locale, "Actual")}</span>
            <span className="text-right">{t(locale, "Difference")}</span>
            <span className="text-right">{t(locale, "Checked")}</span>
          </div>
          <ul className="divide-y">
            {positions.map((position) => {
              const Icon = ACCOUNT_ICON[position.kind] ?? Building2;
              const check = position.lastCheck;
              const difference = check ? check.difference : null;
              const agrees = difference !== null && Math.abs(difference) < 0.01;
              const active = params.account === position.id;
              return (
                <li key={position.id} className={cn(active && "bg-brand/[0.05]")}>
                  <div className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_5rem] sm:items-baseline sm:gap-3">
                    <Link
                      href={withParams({
                        account: active ? undefined : position.id,
                        tx: undefined,
                      })}
                      className="focus-ring inline-flex min-w-0 items-center gap-2 rounded text-sm font-medium hover:underline"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{position.name}</span>
                    </Link>
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums sm:text-right",
                        position.systemBalance < 0 ? "text-destructive" : ""
                      )}
                    >
                      {/* The column header is a desktop luxury; on a phone the
                          three figures stack, and unlabelled they are just
                          three numbers. */}
                      <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                        {t(locale, "System")}
                      </span>
                      {formatMoney(position.systemBalance, position.currency)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground sm:text-right">
                      <span className="mr-1 text-[10px] uppercase tracking-wide sm:hidden">
                        {t(locale, "Actual")}
                      </span>
                      {check ? formatMoney(check.actualBalance, position.currency) : "—"}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs font-semibold tabular-nums sm:text-right",
                        difference === null
                          ? "text-muted-foreground"
                          : agrees
                            ? "text-success"
                            : "text-destructive"
                      )}
                    >
                      <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                        {t(locale, "Difference")}
                      </span>
                      {difference === null ? "—" : formatMoney(difference, position.currency)}
                    </span>
                    <span className="text-[11px] text-muted-foreground sm:text-right">
                      {check ? (
                        position.movedSinceCheck ? (
                          <span className="text-warning">{t(locale, "moved since")}</span>
                        ) : (
                          formatRelative(check.asOf, locale)
                        )
                      ) : (
                        <span className="text-warning">{t(locale, "never")}</span>
                      )}
                    </span>
                  </div>

                  {canReconcile ? (
                    <details className="px-3 pb-2">
                      <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-[11px] font-semibold text-brand hover:underline">
                        <Scale className="h-3 w-3" />
                        {t(locale, "Record what it actually holds")}
                      </summary>
                      <div className="mt-2">
                        <ReconcileForm
                          accountId={position.id}
                          kind={position.kind as "BANK" | "MOBILE_MONEY" | "CASH"}
                          systemBalance={position.systemBalance}
                          currency={position.currency}
                        />
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
