import { Hourglass } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { Claim } from "@/lib/claimed";

/**
 * THE SAME FACT, SMALL ENOUGH FOR A ROW.
 *
 * PendingSubmissionNotice is the full panel: it names the claim, shows the
 * proof and lets Finance verify it. That belongs on the cargo page, where
 * somebody has arrived to do something about it.
 *
 * This is for the lists — search results, the chase list, a customer's cargo,
 * a flight's manifest — where the reader is scanning and the only thing they
 * need is "do not ring this customer, and do not take this money again". One
 * line, the colour the app uses for waiting, and the figure so it can be
 * matched against what the customer says they sent.
 *
 * It never replaces the outstanding balance beside it. A claim is not a
 * payment: the bill still owes the money until Finance agrees, and a list that
 * quietly zeroed the balance would be lying about the books to avoid an
 * awkward-looking row.
 */
export function ClaimedBadge({
  claim,
  locale = "en",
  className,
}: {
  claim: Claim | null | undefined;
  locale?: Locale;
  className?: string;
}) {
  if (!claim) return null;

  /* Said when it is true, because "part of a merge" is what tells the desk the
     other consignments are covered too. */
  const merged = claim.covers.length > 1;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning ${className ?? ""}`}
      title={
        `${claim.submissionNumber} · ${formatMoney(claim.amount, claim.currency)}` +
        (claim.transport > 0
          ? ` (${formatMoney(claim.amount - claim.transport, claim.currency)} ${t(locale, "to the bill")}, ` +
            `${formatMoney(claim.transport, claim.currency)} ${t(locale, "transport")})`
          : "")
      }
    >
      <Hourglass className="h-3 w-3 shrink-0" />
      {merged
        ? `${t(locale, "Payment submitted")} · ${claim.covers.length} ${t(locale, "cargo")}`
        : t(locale, "Payment submitted")}
      <span className="font-normal opacity-80">
        {formatMoney(claim.amount, claim.currency)}
      </span>
    </span>
  );
}

/**
 * The line under it, where there is room for the detail.
 *
 * Who sent it up and against what, so Finance can match it to the slip in
 * front of them without opening anything.
 */
export function ClaimedLine({
  claim,
  locale = "en",
}: {
  claim: Claim | null | undefined;
  locale?: Locale;
}) {
  if (!claim) return null;
  const parts = [
    claim.submissionNumber,
    /* Said on the line, because a claimed figure larger than the bill is
       otherwise read as a mistake by whoever picks the row up next. */
    claim.transport > 0
      ? `${t(locale, "includes")} ${formatMoney(claim.transport, claim.currency)} ${t(locale, "transport")}`
      : null,
    claim.reference,
    claim.submittedByName
      ? `${t(locale, "by")} ${claim.submittedByName}`
      : null,
  ].filter(Boolean);
  return (
    <span className="block text-[11px] text-muted-foreground">
      {t(locale, "Waiting for Finance to verify")} · {parts.join(" · ")}
    </span>
  );
}
