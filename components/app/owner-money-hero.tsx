import Image from "next/image";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { t } from "@/lib/i18n";
import { formatLocal } from "@/lib/money";
import { viewerLocale } from "@/lib/viewer";

/* The aircraft the public site opens on — the brand's own picture, already
   allowed in next.config. */
const HERO_PHOTO =
  "https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=1400&q=70";

/** The hour in Dar es Salaam, where the owner reads this. */
function tanzaniaHour() {
  return Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "numeric",
      hour12: false,
    })
  ) % 24;
}

/**
 * THE OWNER'S BANNER: A GREETING, AND THE MONEY IN ONE SENTENCE.
 *
 * The owner asked for the banner the Vegas owner opens on — dark, a photograph
 * down the right, the greeting large and the day's money said in one line under
 * it, with where the money sits as small chips. On a phone the photograph sits
 * softly behind the words and the chips wrap; nothing else is added.
 *
 * Every figure is the shared overview's own (lib/manager-overview.ts), already
 * in shillings, so the banner and the Accounts page cannot disagree.
 */
export async function OwnerMoneyHero({
  firstName,
  roleLabel,
  heldTzs,
  inTodayTzs,
  outTodayTzs,
  netTodayTzs,
  owedTzs,
  bankTzs,
  mobileMoneyTzs,
  cashTzs,
}: {
  firstName: string;
  roleLabel: string;
  heldTzs: number;
  inTodayTzs: number;
  outTodayTzs: number;
  netTodayTzs: number;
  /** Every unpaid bill, in shillings. */
  owedTzs: number;
  bankTzs: number;
  mobileMoneyTzs: number;
  cashTzs: number;
}) {
  const locale = await viewerLocale();
  const hour = tanzaniaHour();
  const greeting =
    hour < 12
      ? t(locale, "Good morning")
      : hour < 17
        ? t(locale, "Good afternoon")
        : t(locale, "Good evening");
  const net = Math.round(netTodayTzs);
  const chips = [
    { label: t(locale, "Bank"), value: bankTzs, dot: "bg-sky-400" },
    { label: t(locale, "Mobile money"), value: mobileMoneyTzs, dot: "bg-emerald-400" },
    { label: t(locale, "Cash"), value: cashTzs, dot: "bg-amber-300" },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#0b1322] text-white shadow-[0_24px_60px_-30px_rgba(5,15,40,0.8)]">
      {/* The photograph: the right half on a wide screen, softly behind the
          words on a phone. */}
      <div aria-hidden className="absolute inset-y-0 right-0 -z-10 w-full sm:w-[55%]">
        <Image
          src={HERO_PHOTO}
          alt=""
          fill
          sizes="(min-width: 640px) 55vw, 100vw"
          className="object-cover object-center opacity-35 sm:opacity-80"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1322] via-[#0b1322]/75 to-[#0b1322]/10 sm:via-[#0b1322]/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1322]/80 via-transparent to-transparent" />
      </div>
      {/* The brand's red and blue, as light rather than as a gradient block. */}
      <div aria-hidden className="absolute -left-24 -top-28 -z-10 size-80 rounded-full bg-[radial-gradient(circle,rgba(232,64,64,0.35),transparent_65%)]" />
      <div aria-hidden className="absolute -bottom-40 left-1/4 -z-10 size-96 rounded-full bg-[radial-gradient(circle,rgba(56,132,255,0.28),transparent_65%)]" />

      <div className="relative max-w-2xl px-5 py-6 sm:p-7 lg:p-8">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#ff9b8f]">
          {t(locale, "Management")} · {t(locale, roleLabel)}
        </p>
        <h1 className="font-display text-[1.6rem] font-semibold leading-tight tracking-tight sm:text-3xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-white/75 sm:text-[15px]">
          <strong className="font-semibold text-white">{formatLocal(heldTzs)}</strong>{" "}
          {t(locale, "you can use right now")} ·{" "}
          <strong className="font-semibold text-emerald-300">{formatLocal(inTodayTzs)}</strong>{" "}
          {t(locale, "collected today")}
          {owedTzs > 0.5 ? (
            <>
              {" "}·{" "}
              <strong className="font-semibold text-amber-300">{formatLocal(owedTzs)}</strong>{" "}
              {t(locale, "owed by customers")}
            </>
          ) : null}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href="/app/finance/accounts"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs text-white/70 backdrop-blur transition-colors hover:bg-white/[0.12]"
            >
              <span className={`size-2 rounded-full ${chip.dot}`} />
              <strong className="whitespace-nowrap text-sm font-semibold tabular-nums text-white">
                {formatLocal(chip.value)}
              </strong>
              {chip.label}
            </Link>
          ))}
          {/* The net move today, worded as one; both gross figures on hover. */}
          <span
            title={`${t(locale, "In")} ${formatLocal(inTodayTzs)} · ${t(locale, "out")} ${formatLocal(outTodayTzs)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs text-white/70 backdrop-blur"
          >
            {net === 0 ? null : net > 0 ? (
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-rose-300" />
            )}
            {net === 0 ? (
              t(locale, "No change today")
            ) : (
              <>
                <strong className="whitespace-nowrap text-sm font-semibold tabular-nums text-white">
                  {formatLocal(Math.abs(net))}
                </strong>
                {net > 0 ? t(locale, "up today") : t(locale, "down today")}
              </>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
