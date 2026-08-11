import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Building2, Smartphone, Wallet } from "lucide-react";

import { formatMoney, formatRelative } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

type Kind = "BANK" | "MOBILE_MONEY" | "CASH";

const ICON = { BANK: Building2, MOBILE_MONEY: Smartphone, CASH: Wallet } as const;

const KIND_LABEL = {
  BANK: "Bank account",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

/**
 * A wash rather than a fill.
 *
 * A grid of six fully saturated cards is a fruit salad; the colour has to say
 * "this is a bank, that is a till" at a glance without any one card shouting
 * over the balance printed on it.
 */
const WASH = {
  BANK: "from-brand/25 via-brand/5",
  MOBILE_MONEY: "from-signal/25 via-signal/5",
  CASH: "from-success/25 via-success/5",
} as const;

const CHIP = {
  BANK: "bg-brand/15 text-brand ring-brand/20",
  MOBILE_MONEY: "bg-signal/15 text-signal ring-signal/20",
  CASH: "bg-success/15 text-success ring-success/20",
} as const;

/**
 * Grouped like the number printed on a card, because that is how it is read
 * aloud and how it is checked against a statement. 0150597916300 is a wall;
 * 0150 5979 1630 0 can be compared digit by digit without losing your place.
 */
function groupNumber(value: string) {
  return value.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * One company account, shaped like the thing it represents.
 *
 * The account IS a card — a bank card, a till, a tin — so it is drawn as one:
 * the institution and its mark at the top, the balance as the object of the
 * whole surface, the account number set like a card number underneath, and
 * what has moved through it along the bottom edge.
 *
 * Every account is shown, including the ones holding nothing. An empty account
 * is quieter — no wash, no movement line — but it is present, because "we have
 * an M-Pesa till and it is empty" is a different fact from "we have no M-Pesa
 * till", and the page has to be able to say both.
 */
export async function AccountCard({
  id,
  name,
  institution,
  accountNumber,
  kind,
  currency,
  active,
  net,
  netUsd,
  inflow,
  outflow,
  entries,
  lastMovedAt,
}: {
  id: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
  kind: Kind;
  currency: string;
  active: boolean;
  net: number;
  netUsd: number;
  inflow: number;
  outflow: number;
  entries: number;
  lastMovedAt: Date | null;
}) {
  const locale = await viewerLocale();
  const Icon = ICON[kind];
  const live = entries > 0;
  const title = kind === "BANK" ? (institution ?? name) : name;

  return (
    <Link
      href={`/app/finance/accounts/${id}`}
      className={`focus-ring group relative flex min-h-[13rem] flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-lift ${
        active ? "" : "opacity-55"
      }`}
    >
      {/* The wash only on accounts that hold something, so the eye lands on
          money first without the empty ones being hidden. */}
      {live ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent ${WASH[kind]}`}
        />
      ) : null}
      <span
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.06]"
      />

      <div className="relative flex items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${CHIP[kind]}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t(locale, KIND_LABEL[kind])}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border bg-background/60 px-2 py-0.5 font-mono text-[10px] font-semibold backdrop-blur">
          {currency === "TZS" ? "TSh" : currency}
        </span>
      </div>

      <div className="relative px-5">
        <p
          className={`font-display text-[30px] font-bold leading-none tracking-tight tabular-nums ${
            live ? "" : "text-muted-foreground"
          }`}
        >
          {formatMoney(net, currency)}
        </p>
        {live && currency !== "USD" ? (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {formatUsd(netUsd)}
          </p>
        ) : null}
      </div>

      {/* Set like the number on the card it is. */}
      <p className="relative mt-3 px-5 font-mono text-xs tracking-[0.18em] text-muted-foreground">
        {accountNumber ? groupNumber(accountNumber) : " "}
      </p>

      <div className="relative mt-auto border-t px-5 py-3">
        {live ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-success">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              {formatMoney(inflow, currency)}
            </span>
            {outflow > 0 ? (
              <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {formatMoney(outflow, currency)}
              </span>
            ) : null}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {entries}{" "}
              {entries === 1 ? t(locale, "movement") : t(locale, "movements")}
              {lastMovedAt ? ` · ${formatRelative(lastMovedAt, locale)}` : ""}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t(locale, "Nothing has moved through this account yet")}
          </p>
        )}
      </div>
    </Link>
  );
}
