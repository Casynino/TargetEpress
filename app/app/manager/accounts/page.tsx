import Link from "next/link";
import type { Metadata } from "next";
import {
  Building2,
  ChevronRight,
  ShieldAlert,
  Smartphone,
  Wallet,
} from "lucide-react";

import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reconciliationStandings } from "@/lib/control";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account checks" };

/** The mark each kind of account carries everywhere else in the app. */
const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

const KIND_LABEL = {
  BANK: "Bank account",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

/**
 * One account's reconciliation standing, as a sentence fragment with a tone.
 *
 * Computed once and rendered twice — the table for a desk, the stacked list
 * for a phone — because the moment the two renderings derive it separately
 * they start disagreeing about what "checked" means.
 */
function standingText(
  locale: Locale,
  standing:
    | {
        asOf: Date;
        difference: number;
        checkedByName: string;
        movedSince: boolean;
      }
    | null,
  currency: string
) {
  if (!standing) {
    return {
      headline: t(locale, "Never checked"),
      tone: "text-warning" as const,
      detail: t(
        locale,
        "Nothing outside the system has ever confirmed this figure."
      ),
    };
  }
  const matched = standing.difference === 0;
  return {
    headline: matched
      ? t(locale, "matched")
      : `${
          standing.difference < 0 ? t(locale, "short by") : t(locale, "over by")
        } ${formatMoney(Math.abs(standing.difference), currency)}`,
    tone: matched ? ("text-success" as const) : ("text-destructive" as const),
    detail: `${formatRelative(standing.asOf, locale)} · ${standing.checkedByName}${
      standing.movedSince ? ` · ${t(locale, "ledger has moved since")}` : ""
    }`,
  };
}

/**
 * Every account, and when somebody last proved it against the outside.
 *
 * The finance accounts page answers "how much is where". This one answers the
 * manager's different question — "who has checked, and what did they find" —
 * because a balance the system reports is the system agreeing with itself,
 * and only a statement, a phone screen or a till count can contradict it.
 *
 * An account never reconciled says so in words, in warning tone. A blank cell
 * would read as "nothing to report", and the absence of a check is precisely
 * the thing this page exists to report.
 *
 * Balances are IN THE ACCOUNT'S OWN CURRENCY, never converted. A manager
 * reconciles against a CRDB statement denominated in shillings; a figure
 * passed through today's rate could never match it and would make every
 * comparison on this page fail by exactly the rate movement.
 */
export default async function ManagerAccountsPage() {
  await requirePermission("account.view");
  const locale = await viewerLocale();

  const [accounts, balances, standings] = await Promise.all([
    prisma.companyAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    }),
    accountBalances(prisma),
    reconciliationStandings(),
  ]);

  const byAccount = new Map(balances.map((row) => [row.accountId, row]));

  const rows = accounts.map((account) => {
    const movement = byAccount.get(account.id);
    const inflow = toNumber(movement?.inflow ?? 0);
    const outflow = toNumber(movement?.outflow ?? 0);
    const lastMovedAt = movement?.lastMovedAt ?? null;
    const latest = standings.get(account.id) ?? null;
    return {
      account,
      inflow,
      outflow,
      net: inflow - outflow,
      standing: latest
        ? {
            asOf: latest.asOf,
            difference: toNumber(latest.difference),
            checkedByName: latest.checkedBy.name,
            /* "Moved since" compares the ledger's newest movement against the
               moment the check was a statement ABOUT — not against when it was
               typed. A check of Monday's close covers Monday; anything that
               moved after Monday is outside it, however fresh the typing. */
            movedSince: lastMovedAt !== null && lastMovedAt > latest.asOf,
          }
        : null,
    };
  });

  const active = rows.filter((r) => r.account.active);
  const neverChecked = active.filter((r) => !r.standing).length;
  const standingMismatch = active.filter(
    (r) => r.standing && r.standing.difference !== 0
  ).length;

  return (
    <>
      <PageHeader
        title={t(locale, "Account checks")}
        description={t(
          locale,
          "Every account, what the ledger says it holds, and when somebody last proved that against a statement, a phone or a till count."
        )}
      />

      {/* The page's verdict in one line, so the manager knows before the table
          whether this is a reading visit or a working one. */}
      <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {active.length - neverChecked}{" "}
          {t(locale, "of")} {active.length}{" "}
          {t(locale, "live accounts have been checked at least once")}
        </span>
        {standingMismatch > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-destructive">
            <ShieldAlert className="h-3.5 w-3.5" />
            {standingMismatch} {t(locale, "standing at a mismatch")}
          </span>
        ) : null}
        {neverChecked > 0 ? (
          <span className="font-medium text-warning">
            {neverChecked} {t(locale, "never checked")}
          </span>
        ) : null}
      </p>

      {/* The same rows twice: a register for a desk, a stack for a phone.
          Same derivations, same standing text — see standingText above. */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
        {rows.map(({ account, net, inflow, outflow, standing }) => {
          const Icon = KIND_ICON[account.kind];
          const s = standingText(locale, standing, account.currency);
          return (
            <li key={account.id}>
              <Link
                href={`/app/manager/accounts/${account.id}`}
                className={`block p-3 transition-colors hover:bg-accent/40 ${
                  account.active ? "" : "opacity-55"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <IconHint label={t(locale, KIND_LABEL[account.kind])}>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </IconHint>
                    <span className="truncate text-sm font-medium">
                      {account.name}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(net, account.currency)}
                  </span>
                </div>
                <p className="tabular mt-1 text-[11px] text-muted-foreground">
                  {t(locale, "in")} {formatMoney(inflow, account.currency)} ·{" "}
                  {t(locale, "out")} {formatMoney(outflow, account.currency)}
                </p>
                <p className="mt-1 text-[11px]">
                  <span className={`font-medium ${s.tone}`}>{s.headline}</span>{" "}
                  <span className="text-muted-foreground">{s.detail}</span>
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
              <TableHead>{t(locale, "Account")}</TableHead>
              <TableHead className="text-right">{t(locale, "Balance")}</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                {t(locale, "Money in")}
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                {t(locale, "Money out")}
              </TableHead>
              <TableHead>{t(locale, "Last checked")}</TableHead>
              <TableHead className="text-right">{t(locale, "Found")}</TableHead>
              <TableHead className="w-8" aria-label={t(locale, "Open")} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ account, net, inflow, outflow, standing }) => {
              const Icon = KIND_ICON[account.kind];
              const s = standingText(locale, standing, account.currency);
              return (
                <TableRow
                  key={account.id}
                  className={account.active ? "" : "opacity-55"}
                >
                  <TableCell>
                    <Link
                      href={`/app/manager/accounts/${account.id}`}
                      className="flex items-center gap-2 font-medium hover:text-brand"
                    >
                      <IconHint label={t(locale, KIND_LABEL[account.kind])}>
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </IconHint>
                      <span className="truncate">{account.name}</span>
                      {!account.active ? (
                        <span className="text-[11px] text-muted-foreground">
                          {t(locale, "archived")}
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right text-sm font-semibold">
                    {formatMoney(net, account.currency)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-[11px] text-muted-foreground lg:table-cell">
                    {formatMoney(inflow, account.currency)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-[11px] text-muted-foreground lg:table-cell">
                    {formatMoney(outflow, account.currency)}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {standing ? (
                      s.detail
                    ) : (
                      /* The absence IS the row's finding, so it sits in the
                         "when" column where the eye looks for a date. */
                      <span className="font-medium text-warning">
                        {s.headline}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`tabular whitespace-nowrap text-right text-xs font-medium ${s.tone}`}
                  >
                    {standing ? s.headline : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
