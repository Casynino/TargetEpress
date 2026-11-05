import Image from "next/image";

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
 * it. Where the money sits is NOT here — the owner asked for the banner clean,
 * and the split lives in its own card just under it, as a ring. On a phone the
 * photograph sits softly behind the words.
 *
 * Every figure is the shared overview's own (lib/manager-overview.ts), already
 * in shillings, so the banner and the Accounts page cannot disagree.
 */
export async function OwnerMoneyHero({
  firstName,
  roleLabel,
  heldTzs,
  inTodayTzs,
  owedTzs,
}: {
  firstName: string;
  roleLabel: string;
  heldTzs: number;
  inTodayTzs: number;
  /** Every unpaid bill, in shillings. */
  owedTzs: number;
}) {
  const locale = await viewerLocale();
  const hour = tanzaniaHour();
  const greeting =
    hour < 12
      ? t(locale, "Good morning")
      : hour < 17
        ? t(locale, "Good afternoon")
        : t(locale, "Good evening");

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

      </div>
    </section>
  );
}
