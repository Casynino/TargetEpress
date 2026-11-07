import { PageBanner } from "@/components/app/page-banner";
import { t } from "@/lib/i18n";
import { formatLocal } from "@/lib/money";
import { viewerLocale } from "@/lib/viewer";

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
 * THE OWNER'S BANNER: the small banner every desk opens on, and the money in
 * one line.
 *
 * The owner asked for every banner small and clean (8 Nov 2026), his own
 * included. What stays is what his dashboard is for: the money he can use
 * right now, what came in today and what customers owe, as one short line
 * under the greeting. Where the money sits lives in its own card just below.
 *
 * Every figure is the shared overview's own (lib/manager-overview.ts), already
 * in shillings, so the banner and the Accounts page cannot disagree.
 */
export async function OwnerMoneyHero({
  firstName,
  heldTzs,
  inTodayTzs,
  owedTzs,
}: {
  firstName: string;
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
    <PageBanner
      title={t(locale, "Management")}
      line={`${greeting}, ${firstName}`}
      extra={
        <>
          <strong className="font-semibold text-white">{formatLocal(heldTzs)}</strong>{" "}
          {t(locale, "you can use right now")} ·{" "}
          <strong className="font-semibold text-emerald-300">{formatLocal(inTodayTzs)}</strong>{" "}
          {t(locale, "collected today")}
          {owedTzs > 0.5 ? (
            <>
              {" "}·{" "}
              <strong className="font-semibold text-[#fdc400]">{formatLocal(owedTzs)}</strong>{" "}
              {t(locale, "owed by customers")}
            </>
          ) : null}
        </>
      }
    />
  );
}
