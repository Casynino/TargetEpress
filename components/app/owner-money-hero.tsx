import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";

import { DualClock } from "@/components/app/dual-clock";
import { t } from "@/lib/i18n";
import { formatLocal } from "@/lib/money";
import { viewerLocale } from "@/lib/viewer";

/* White at falling strengths, so the bar and the dots read on the brand
   gradient in either theme; a palette of colours fought the red and the blue. */
const SHARE = ["bg-white", "bg-white/70", "bg-white/45", "bg-white/30", "bg-white/20"];

/**
 * THE OWNER'S FIRST QUESTION, ANSWERED BEFORE ANYTHING ELSE: HOW MUCH MONEY.
 *
 * The owner asked for the banner the Hao Stock owner opens on — the money you
 * can use right now, whether it moved today, and where it sits — in place of
 * a greeting and a search box. Every figure here is the shared overview's own
 * (lib/manager-overview.ts), already in shillings, so this banner and the
 * Accounts page cannot disagree.
 *
 * On a phone it is the figure, the day's move and one line of accounts; the
 * rows and the bar wait for a screen with room for them.
 */
export async function OwnerMoneyHero({
  firstName,
  today,
  heldTzs,
  inTodayTzs,
  outTodayTzs,
  netTodayTzs,
  accounts,
}: {
  firstName: string;
  today: string;
  heldTzs: number;
  inTodayTzs: number;
  outTodayTzs: number;
  netTodayTzs: number;
  accounts: { name: string; kind: string; tzs: number }[];
}) {
  const locale = await viewerLocale();
  /* An account holding nothing is not an answer to "where does it sit". */
  const shown = accounts.filter((account) => Math.abs(account.tzs) >= 0.5);
  const net = Math.round(netTodayTzs);
  const headline = formatLocal(heldTzs);

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl">
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-signal via-brand to-info"
      />
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/5"
      />

      <div className="relative grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10">
        {/* The money, first. Sized to its own column so a long balance shrinks
            instead of running off the card on a narrow laptop. */}
        <div className="min-w-0 [container-type:inline-size]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 sm:text-[11px]">
            {t(locale, "Money you can use right now")}
          </p>
          <p
            className="mt-1.5 whitespace-nowrap font-display font-bold leading-none tracking-tight text-white tabular-nums sm:mt-2"
            style={{
              fontSize: `min(48px, calc(100cqi / ${(0.62 * headline.length).toFixed(2)}))`,
            }}
          >
            {headline}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3">
            {/* The NET move in the balance above — so it is worded as one, and
                both gross figures are on hover. */}
            <span
              title={`${t(locale, "In")} ${formatLocal(inTodayTzs)} · ${t(locale, "out")} ${formatLocal(outTodayTzs)}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                net === 0
                  ? "bg-white/15 text-white/85"
                  : net > 0
                    ? "bg-white/20 text-white"
                    : "bg-black/25 text-white"
              }`}
            >
              {net === 0 ? null : net > 0 ? (
                <ArrowDownLeft className="h-3 w-3" />
              ) : (
                <ArrowUpRight className="h-3 w-3" />
              )}
              {net === 0
                ? t(locale, "No change today")
                : `${formatLocal(Math.abs(net))} ${net > 0 ? t(locale, "up today") : t(locale, "down today")}`}
            </span>
          </div>
          <p className="mt-4 hidden text-sm text-white/75 sm:block">
            {t(locale, "Habari,")} {firstName} · {today}
          </p>
          <div className="mt-1 hidden text-[11px] text-white/65 sm:block">
            <DualClock inline emphasis="TZ" />
          </div>
        </div>

        {/* Where that money sits. */}
        <div className="min-w-0">
          {/* Phone: one strip, tapping through to the accounts. */}
          <Link
            href="/app/finance/accounts"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden"
          >
            {shown.map((account, i) => (
              <span key={account.name} className="flex min-w-0 items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SHARE[i % SHARE.length]}`} />
                <span className="truncate text-[11px] text-white/70">{account.name}</span>
                <span className="text-xs font-bold tabular-nums text-white">
                  {formatLocal(account.tzs)}
                </span>
              </span>
            ))}
          </Link>

          <div className="hidden sm:block">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">
                {t(locale, "Where it sits")}
              </p>
              <Link
                href="/app/finance/accounts"
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-white/85 hover:text-white"
              >
                {t(locale, "Open accounts")}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {heldTzs > 0 ? (
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/15">
                {shown.map((account, i) => (
                  <div
                    key={account.name}
                    className={SHARE[i % SHARE.length]}
                    style={{ width: `${Math.max(0, (account.tzs / heldTzs) * 100)}%` }}
                  />
                ))}
              </div>
            ) : null}
            <div className="mt-3 divide-y divide-white/15">
              {shown.length === 0 ? (
                <p className="py-2.5 text-sm text-white/75">
                  {t(locale, "No account holds any money yet.")}
                </p>
              ) : (
                shown.slice(0, 5).map((account, i) => (
                  <Link
                    key={account.name}
                    href="/app/finance/accounts"
                    className="flex items-center gap-3 py-2 transition-opacity hover:opacity-85"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SHARE[i % SHARE.length]}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">
                      {account.name}
                    </span>
                    <span
                      className={`shrink-0 text-base font-bold tabular-nums ${account.tzs < 0 ? "text-white/70" : "text-white"}`}
                    >
                      {formatLocal(account.tzs)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/60">
                      {heldTzs > 0
                        ? (() => {
                            const share = (account.tzs / heldTzs) * 100;
                            return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
                          })()
                        : ""}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
