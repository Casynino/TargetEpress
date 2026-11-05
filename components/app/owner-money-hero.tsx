import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";

import { t } from "@/lib/i18n";
import { formatLocal } from "@/lib/money";
import { viewerLocale } from "@/lib/viewer";

/**
 * THE OWNER'S FIRST QUESTION, ANSWERED IN ONE CLEAN STRIP: HOW MUCH MONEY.
 *
 * The money you can use right now and whether it moved today — on a phone that
 * is the whole banner. A wider screen adds one line saying where it sits, by
 * kind (bank, mobile money, cash), with the accounts a press away. The owner
 * asked for it clean: a panel of account rows made the banner most of the
 * screen before any analysis began.
 *
 * Every figure is the shared overview's own (lib/manager-overview.ts), already
 * in shillings, so this strip and the Accounts page cannot disagree.
 */
export async function OwnerMoneyHero({
  heldTzs,
  inTodayTzs,
  outTodayTzs,
  netTodayTzs,
  bankTzs,
  mobileMoneyTzs,
  cashTzs,
}: {
  heldTzs: number;
  inTodayTzs: number;
  outTodayTzs: number;
  netTodayTzs: number;
  bankTzs: number;
  mobileMoneyTzs: number;
  cashTzs: number;
}) {
  const locale = await viewerLocale();
  const net = Math.round(netTodayTzs);
  const headline = formatLocal(heldTzs);
  const kinds = [
    { label: t(locale, "Bank"), value: bankTzs },
    { label: t(locale, "Mobile money"), value: mobileMoneyTzs },
    { label: t(locale, "Cash"), value: cashTzs },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-signal via-brand to-info"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5"
      />

      <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        {/* Sized to its own column, so a long balance shrinks rather than runs. */}
        <div className="min-w-0 lg:flex-1 [container-type:inline-size]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 sm:text-[11px]">
            {t(locale, "Money you can use right now")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p
              className="whitespace-nowrap font-display font-bold leading-none tracking-tight text-white tabular-nums"
              style={{
                fontSize: `min(40px, calc(100cqi / ${(0.62 * headline.length).toFixed(2)}))`,
              }}
            >
              {headline}
            </p>
            {/* The NET move in the balance above, worded as one; both gross
                figures are on hover. */}
            <span
              title={`${t(locale, "In")} ${formatLocal(inTodayTzs)} · ${t(locale, "out")} ${formatLocal(outTodayTzs)}`}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
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
        </div>

        {/* Where it sits, by kind — one line, from a tablet up. */}
        <Link
          href="/app/finance/accounts"
          className="hidden items-end gap-6 text-white sm:flex lg:shrink-0"
        >
          {kinds.map((kind) => (
            <span key={kind.label} className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {kind.label}
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-sm font-bold tabular-nums">
                {formatLocal(kind.value)}
              </span>
            </span>
          ))}
          <ChevronRight className="mb-0.5 h-4 w-4 shrink-0 text-white/70" />
        </Link>
      </div>
    </div>
  );
}
