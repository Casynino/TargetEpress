import { PageBanner, bannerDate } from "@/components/app/page-banner";
import { t } from "@/lib/i18n";
import { formatLocal } from "@/lib/money";
import { viewerLocale } from "@/lib/viewer";

/**
 * THE OWNER'S BANNER: the small banner every desk opens on, and the money in
 * one line.
 *
 * The owner asked for every banner small and clean (8 Nov 2026), his own
 * included. What stays is what his dashboard is for: the money he can use
 * right now, what came in today and what customers owe, as one short line
 * under the date. Where the money sits lives in its own card just below.
 *
 * Every figure is the shared overview's own (lib/manager-overview.ts), already
 * in shillings, so the banner and the Accounts page cannot disagree.
 */
export async function OwnerMoneyHero({
  heldTzs,
  inTodayTzs,
  owedTzs,
}: {
  heldTzs: number;
  inTodayTzs: number;
  /** Every unpaid bill, in shillings. */
  owedTzs: number;
}) {
  const locale = await viewerLocale();

  return (
    <PageBanner
      title={t(locale, "Management")}
      line={bannerDate(locale)}
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
