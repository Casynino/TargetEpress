"use client";

import { useT } from "@/components/app/locale-provider";

/**
 * "THE CUSTOMER PAID CARGO PLUS TRANSPORT."
 *
 * One transfer arrives carrying two different kinds of money: the freight,
 * which is the company's, and the delivery, which is on its way to whoever
 * drives. The customer's proof shows the two added together and nothing else —
 * so the only way anybody can check a payment against that proof is if the
 * screen shows the same single figure AND how it was separated.
 *
 * It is the same three lines on every desk. Finance taking money at the
 * counter, Support handing a claim up, the merge screen answering four bills
 * at once: all of them are looking at one customer's message, and a desk that
 * learns to read this block in one place must not meet a different shape in
 * the next. It lived inline on the cargo panel and as a single sentence on the
 * other three, which is exactly how two screens start disagreeing about what a
 * figure means.
 *
 * Renders nothing when there is no transport, which is almost every payment.
 */
export function TransportSplit({
  cargo,
  transport,
  total,
  money,
  className,
}: {
  /** What actually settles the bill — the total less the fare. */
  cargo: number;
  /** The delivery half, on its way straight out again. */
  transport: number;
  /** The whole figure the customer handed over. */
  total: number;
  /** How this screen writes money, so the block speaks its host's units. */
  money: (value: number) => string;
  className?: string;
}) {
  const t = useT();
  if (!(transport > 0)) return null;

  return (
    <div
      className={`rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-xs ${className ?? ""}`}
    >
      <p className="font-semibold uppercase tracking-wide text-warning">
        {t("The customer paid cargo plus transport")}
      </p>
      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("Cargo charge")}</dt>
          <dd className="font-semibold tabular-nums">{money(cargo)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            {t("Transport (passed on)")}
          </dt>
          <dd className="font-semibold tabular-nums text-warning">
            {money(transport)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-warning/20 pt-1">
          <dt className="font-medium">{t("Total received")}</dt>
          <dd className="font-bold tabular-nums">{money(total)}</dd>
        </div>
      </dl>
      {/* The whole point of showing the total back: it is the one figure on
          the customer's message, and it is the only one anybody can check. */}
      <p className="mt-2 border-t border-warning/20 pt-2 text-[11px] text-muted-foreground">
        {t("Check this total against the customer's message.")}
      </p>
    </div>
  );
}
