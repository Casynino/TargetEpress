import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import type { BatchFinance } from "@/lib/batch-finance";
import { formatLocal, formatShillings, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

/**
 * What this batch is worth, above everything else on the page.
 *
 * The owner's rule: Finance opens a dispatch to answer a money question, so
 * the money answer comes before the cargo detail rather than after it.
 *
 * Two honesty rules run through this panel. Cargo that has been invoiced
 * contributes the figure Finance confirmed; cargo that has not is priced from
 * the rate book and is labelled an estimate, in the subtext and again in the
 * footer — a number that might move must never look like one that cannot.
 * And outstanding counts only what has actually been billed: nobody owes money
 * against an estimate, so rolling estimates into a debt figure would invent a
 * receivable that no customer has ever been shown.
 */
export async function BatchFinanceBand({
  finance,
  showCosts = true,
}: {
  finance: BatchFinance;
  /**
   * Whether this reader may see what the batch COST.
   *
   * Customer Care holds finance.view so it can chase what a customer owes and
   * manage the invoice — that is the job. It does not follow that the desk may
   * see the clearing agent's fee, the expected profit or the margin. Those
   * three cells, and the expense register under them, follow expense.view:
   * Finance and the owner.
   */
  showCosts?: boolean;
}) {
  const locale = await viewerLocale();
  const {
    expectedUsd,
    expectedTzs,
    estimatedUsd,
    invoicedUsd,
    billedUsd,
    drafts,
    rate,
    customers,
    invoiced,
    pieces,
    receivedUsd,
    outstandingUsd,
    cashBilledUsd,
    creditBilledUsd,
    creditOutstandingUsd,
    creditOverdueUsd,
    unpriceable,
    writtenOffUsd,
    storageChargedUsd,
    storageWaivedUsd,
    storageHolding,
    expensesUsd,
    expensesTzs,
    expenseCount,
    netProfitUsd,
    marginPct,
    atALoss,
    unreachable,
  } = finance;

  /* One converter, not a ternary per figure — the house rule, and the reason the
     ledger once led in shillings while the profit page beside it led in dollars.
     With no rate published the dollar figure stands rather than a guess. */
  const money = (usd: number) => formatShillings(usd, rate);

  /*
    A cell's own decomposition, printed under it rather than beside it.

    The obvious way to add cash-versus-credit revenue to this band was two more
    cells, which would have made it eight — and the owner has already rejected
    this panel once for being repetitive at six. Two more cells would also read
    as two more independent totals somebody has to reconcile, when they are
    halves of the figure directly above them. So a `note` is a breakdown of its
    own cell and nothing else, and it renders only when there is something to
    break down: a flight with no credit on it looks exactly as it did before,
    because a line saying "no credit" is a line spent on an absence.
  */
  type Cell = {
    k: string;
    usd?: number;
    /** An exact shilling figure, already summed per row. Beats usd × rate. */
    tsh?: number | null;
    percent?: string;
    tone?: string;
    note?: ReactNode;
  };

  const hasCredit = creditBilledUsd > 0.005;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-br from-brand/5 to-transparent px-5 py-4">
        <h2 className="font-display font-semibold">
          {t(locale, "Financial overview")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "Collected and Expenses are money that has actually moved. The rest is what this batch is expected to be worth once everyone pays."
          )}
        </p>
      </div>

      {/*
        The six figures, before any of the detail.

        Named for what they actually are. Revenue here is what has been BILLED,
        not banked, so it is expected revenue — and every figure derived from it
        is expected too. Only Collected and Expenses describe money that has
        really moved. Calling a billed figure "revenue" and a billed-minus-costs
        figure "net profit" is how a batch reads as a good one months before
        anybody has paid for it.

        Colour follows the same rule as the words. Green marks money the
        business is actually holding, and that is Collected alone. Red marks
        money that is against you: gone (Expenses), not arrived (Outstanding),
        or a batch that has turned over (a loss). An expected profit printed
        in the same green as a bank balance is the figure arguing for itself —
        so it is set in plain type like every other expectation, and only
        turns red when the answer is a loss, which is worth interrupting
        somebody for even before it is certain.
      */}
      <dl className={cn(
        "grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-3",
        /* Sized to what is actually shown. Six columns with three cells in
           them left half the band as an empty slab of border colour on every
           screen Support opens. */
        showCosts ? "lg:grid-cols-6" : "lg:grid-cols-3"
      )}>
        {([
          {
            k: t(locale, "Expected revenue"),
            usd: billedUsd,
            tone: "",
            /*
              How much of this flight went out unpaid, by agreement.

              Both halves are billed, and NEITHER is money in the account —
              "cash" here means billed for payment on collection, not cash in
              hand, which is why Collected sits in the next cell and not this
              one. The credit half is the figure that changes what the rest of
              the band means: a flight that has billed forty million with a
              third of it on terms is not the same flight as one that billed
              forty million at the counter, and until now the band could not
              tell them apart.
            */
            note: hasCredit ? (
              <>
                {t(locale, "Cash")} {money(cashBilledUsd)}
                {" · "}
                <span className="font-medium text-brand">
                  {t(locale, "Credit")} {money(creditBilledUsd)}
                </span>
              </>
            ) : null,
          },
          { k: t(locale, "Collected"), usd: receivedUsd, tone: "text-success" },
          {
            /*
              Expected, like everything else derived from a bill.

              It is expected revenue minus what has come in, so it inherits
              every estimate in the first figure. Calling the other four
              "expected" and this one a flat "Outstanding" implied it was the
              settled one on the row, when it is the figure most likely to move
              — a price gets confirmed, a bill gets written off, and it changes.
            */
            k: t(locale, "Expected outstanding"),
            usd: outstandingUsd,
            tone: outstandingUsd > 0 ? "text-destructive" : "",
            /*
              A customer who has not turned up and a customer Finance agreed to
              wait for were the same number here, and they are opposite
              problems: one is a collection failure, the other is a decision the
              company made on purpose. Overdue is called out because that is the
              part where the agreement has already run out.
            */
            note:
              creditOutstandingUsd > 0.005 ? (
                <>
                  {money(creditOutstandingUsd)} {t(locale, "on credit terms")}
                  {creditOverdueUsd > 0.005 ? (
                    <span className="font-semibold text-destructive">
                      {" · "}
                      {money(creditOverdueUsd)} {t(locale, "overdue")}
                    </span>
                  ) : null}
                </>
              ) : null,
          },
          ...(showCosts
            ? [
                {
                  k: t(locale, "Expenses"),
                  usd: expensesUsd,
                  tsh: expensesTzs,
                  tone: "text-destructive",
                },
                {
                  k: atALoss
                    ? t(locale, "Expected loss")
                    : t(locale, "Expected profit"),
                  usd: Math.abs(netProfitUsd),
                  tone: atALoss ? "text-destructive" : "",
                },
                {
                  k: t(locale, "Expected margin"),
                  // No margin rather than a zero: a batch that has billed
                  // nothing has not made 0%, it has no answer yet.
                  percent:
                    marginPct === null ? "—" : `${Math.round(marginPct)}%`,
                  tone: atALoss ? "text-destructive" : "",
                },
              ]
            : []),
        ] satisfies Cell[]).map((cell) => (
          <div key={cell.k} className="bg-card px-5 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.k}
            </dt>
            {/*
              Shillings lead, dollars underneath.

              The office quotes, pays and banks in shillings all day; the dollar
              figure is what the invoice says. Putting the dollar first made
              every reader do the conversion in their head before the number
              meant anything.
            */}
            <dd className={`mt-0.5 font-display text-base font-bold tabular-nums ${cell.tone}`}>
              {cell.percent ??
                (cell.tsh !== undefined && cell.tsh !== null
                  ? formatLocal(cell.tsh)
                  : money(cell.usd!))}
            </dd>
            {cell.percent === undefined && rate !== null ? (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatUsd(cell.usd!)}
              </p>
            ) : null}
            {cell.note ? (
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {cell.note}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      {/*
        One line of context, not eight tiles.

        The strip above already answers revenue, collected, outstanding,
        expenses, profit and margin. The tiles that used to sit here answered
        four of those a second time, in a different unit, which is how a panel
        ends up the height of a screen while saying one thing twice. What is
        left is only what the strip cannot say.
      */}
      {/*
        Only what nothing else on the page says.

        Cargo, weight and customers are already on the line under the title, so
        repeating them here was the same duplication as the tiles, just smaller.
        What is left is how much of the batch is actually billed — which decides
        whether the figures above are complete — and the rate they were
        converted at.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-5 py-2.5 text-xs text-muted-foreground">
        <span>
          {invoiced} {t(locale, "of")} {pieces} {t(locale, "invoiced")}
          {drafts > 0 ? (
            <span className="text-signal">
              {" "}
              · {drafts} {t(locale, "still a draft")}
            </span>
          ) : null}
        </span>
        {/* Revenue given up on when this batch closed. It has already left
            every figure above; this is the only place that says it existed,
            and a flight that closed by abandoning a fifth of its revenue must
            not read like one that collected everything. */}
        {writtenOffUsd > 0 ? (
          <span className="text-muted-foreground">
            {money(writtenOffUsd)} {t(locale, "written off")}
          </span>
        ) : null}
        {/* The warehouse clock on this flight. Storage is already inside the
            revenue above, so this is not another total — it names how much of
            it came from cargo sitting, what the desk forgave, and how many
            consignments are still accruing, which is a phone call list. */}
        {storageChargedUsd > 0 || storageWaivedUsd > 0 || storageHolding > 0 ? (
          <span>
            {storageChargedUsd > 0 ? (
              <>
                {money(storageChargedUsd)} {t(locale, "storage")}
              </>
            ) : (
              t(locale, "No storage charged")
            )}
            {storageWaivedUsd > 0 ? (
              <span className="text-warning">
                {" · "}
                {money(storageWaivedUsd)} {t(locale, "waived")}
              </span>
            ) : null}
            {storageHolding > 0 ? (
              <span className="text-destructive">
                {" "}
                · {storageHolding} {t(locale, "still charging")}
              </span>
            ) : null}
          </span>
        ) : null}
        {/* Outstanding money you cannot ring anybody about. */}
        {unreachable > 0 ? (
          <span className="text-warning">
            {unreachable} {t(locale, "with no phone number to chase")}
          </span>
        ) : null}
        {rate !== null ? (
          /* Every shilling on this page hangs off this one number, and it
             moves. The way to move it is a click from here rather than a
             hunt through the finance tabs. */
          <span className="ml-auto">
            1 USD = {rate.toLocaleString()} TSh{" "}
            <Link
              href="/app/finance/exchange-rate"
              className="font-medium text-brand hover:underline"
            >
              {t(locale, "change")}
            </Link>
          </span>
        ) : (
          <span className="ml-auto text-signal">
            {t(locale, "No exchange rate published yet")}
          </span>
        )}
      </div>

      {estimatedUsd > 0 || unpriceable.length > 0 ? (
        <div className="space-y-1 border-t bg-muted/30 px-5 py-3">
          {estimatedUsd > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                locale,
                "Cargo with no invoice yet is priced from the published rate book, including storage already accrued. Those figures move until Finance confirms them."
              )}
            </p>
          ) : null}
          {unpriceable.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {unpriceable.length}{" "}
                {t(
                  locale,
                  unpriceable.length === 1
                    ? "piece cannot be priced yet and is missing from the figures above —"
                    : "pieces cannot be priced yet and are missing from the figures above —"
                )}{" "}
                {unpriceable
                  .slice(0, 3)
                  .map((u) => u.trackingNumber)
                  .join(", ")}
                {unpriceable.length > 3 ? ` ${t(locale, "and others")}` : ""}
                {t(
                  locale,
                  ". Publish a rate for that cargo and the total will complete itself."
                )}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
