"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { saveBatchRates } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import type { IncomeSheet } from "@/lib/income";
import { formatLocal, formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Money on a wide sheet: grouped, no cents, because these are whole flights. */
const usd = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const tzs = (n: number | null, rate: number | null) =>
  n === null || rate === null ? "—" : formatLocal(n * rate);
/** A per-kilo rate. Two decimals, because 12.5 and 1.8 are the whole point. */
const perKg = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * The sheet Finance keeps, as a page.
 *
 * Laid out the way it is drawn on paper — goods received on the left, goods
 * sold on the right, one row per flight and a total under them — because the
 * point is not to introduce a new way of reading the business. It is the same
 * reading, filled in from the invoices and payments already on record instead
 * of typed twice.
 *
 * Two columns are inputs and the rest are consequences. Freight and customs
 * per kilo are negotiated per flight and nothing in the system can know them;
 * every other figure follows, and a flight whose rates are blank shows dashes
 * rather than a profit of the whole selling price.
 *
 * The whole table is one form. Finance fills a column down and saves once,
 * which is what they do on the paper it replaces.
 */
export function IncomeSheetTable({
  sheet,
  month,
  canEdit,
}: {
  sheet: IncomeSheet;
  month?: string;
  canEdit: boolean;
}) {
  const t = useT();
  const [state, save] = useActionState<
    ActionResult<{ saved: number }>,
    FormData
  >(saveBatchRates, { ok: true });

  const { rows, rate, totals } = sheet;

  const cell = "px-2 py-2 text-right tabular-nums";
  const head =
    "px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide";

  return (
    <form action={save}>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            {/*
              The two halves, named once across the top. Everything under
              "Goods received" is what landed; everything under "Goods sold" is
              what has been collected. The boss reads the gap between them.
            */}
            <tr className="border-b">
              <th
                colSpan={11}
                className="bg-brand/10 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand"
              >
                {t("Goods received")}
              </th>
              <th
                colSpan={4}
                className="border-l bg-success/10 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-success"
              >
                {t("Goods sold")}
              </th>
            </tr>
            <tr className="border-b text-muted-foreground">
              <th className={cn(head, "text-left")}>{t("Batch")}</th>
              <th className={head}>{t("Kg")}</th>
              <th className={head}>{t("Rate")}</th>
              <th className={head}>$</th>
              <th className={head}>TZS</th>
              <th className={head}>{t("Freight")}</th>
              <th className={head}>{t("Customs")}</th>
              <th className={head}>{t("Freight & customs")}</th>
              <th className={head}>{t("Payback")}</th>
              <th className={head}>{t("Profit rate")}</th>
              <th className={head}>{t("Profit")}</th>
              <th className={cn(head, "border-l")}>{t("Kg")}</th>
              <th className={head}>$</th>
              <th className={head}>{t("Actual received")}</th>
              <th className={head}>{t("Still owed")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={row.batchId} className="transition-colors hover:bg-muted/20">
                <td className="px-2 py-2">
                  <input type="hidden" name="batchId" value={row.batchId} />
                  <Link
                    href={`/app/shipments/${row.batchId}`}
                    className="font-mono text-xs font-semibold hover:underline"
                  >
                    {row.batchNumber}
                  </Link>
                </td>
                <td className={cell}>{row.kg.toFixed(1)}</td>
                <td className={cn(cell, "text-muted-foreground")}>
                  {perKg(row.sellRate)}
                </td>
                <td className={cell}>{usd(row.worthUsd)}</td>
                <td className={cell}>{tzs(row.worthUsd, rate)}</td>

                {/* The two that are typed, not computed. */}
                <td className="px-1 py-1">
                  <Input
                    name={`freight:${row.batchId}`}
                    defaultValue={row.freightRate ?? ""}
                    disabled={!canEdit}
                    inputMode="decimal"
                    aria-label={`${t("Freight per kg")} ${row.batchNumber}`}
                    className="h-8 w-16 bg-background px-2 text-right text-sm tabular-nums"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    name={`customs:${row.batchId}`}
                    defaultValue={row.customsRate ?? ""}
                    disabled={!canEdit}
                    inputMode="decimal"
                    aria-label={`${t("Customs per kg")} ${row.batchNumber}`}
                    className="h-8 w-16 bg-background px-2 text-right text-sm tabular-nums"
                  />
                </td>
                <td className={cn(cell, "font-medium")}>{perKg(row.landedRate)}</td>
                <td className={cn(cell, "text-destructive")}>
                  {usd(row.paybackUsd)}
                </td>
                <td className={cn(cell, "text-muted-foreground")}>
                  {perKg(row.profitRate)}
                </td>
                <td
                  className={cn(
                    cell,
                    "font-medium",
                    row.profitUsd !== null && row.profitUsd < 0
                      ? "text-destructive"
                      : ""
                  )}
                >
                  {usd(row.profitUsd)}
                </td>

                <td className={cn(cell, "border-l")}>{row.soldKg.toFixed(1)}</td>
                <td className={cell}>{usd(row.soldUsd)}</td>
                <td className={cn(cell, "text-success")}>
                  {tzs(row.collectedUsd, rate)}
                </td>
                {/*
                  The gap, said out loud.

                  It is the whole reason the two halves sit side by side, and
                  on paper the reader has to do the subtraction themselves
                  every time.
                */}
                <td
                  className={cn(
                    cell,
                    row.worthUsd - row.collectedUsd > 0.5
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {tzs(Math.max(0, row.worthUsd - row.collectedUsd), rate)}
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {t("No flights in this period.")}
                </td>
              </tr>
            ) : null}
          </tbody>

          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-2 py-2 text-xs uppercase tracking-wide">
                {t("Total")}
              </td>
              <td className={cell}>{totals.kg.toFixed(1)}</td>
              {/*
                Weighted, not summed.

                The paper sheet adds the rate column up and gets 38.5, which is
                dollars-per-kilo added to dollars-per-kilo and means nothing.
                What is wanted is what a kilo earned across the whole period.
              */}
              <td className={cn(cell, "text-muted-foreground")}>
                {perKg(totals.sellRate)}
              </td>
              <td className={cell}>{usd(totals.worthUsd)}</td>
              <td className={cell}>{tzs(totals.worthUsd, rate)}</td>
              <td className={cell} />
              <td className={cell} />
              <td className={cell}>{perKg(totals.landedRate)}</td>
              <td className={cn(cell, "text-destructive")}>
                {usd(totals.paybackUsd)}
              </td>
              <td className={cn(cell, "text-muted-foreground")}>
                {perKg(totals.profitRate)}
              </td>
              <td className={cell}>{usd(totals.profitUsd)}</td>
              <td className={cn(cell, "border-l")}>{totals.soldKg.toFixed(1)}</td>
              <td className={cell}>{usd(totals.soldUsd)}</td>
              <td className={cn(cell, "text-success")}>
                {tzs(totals.collectedUsd, rate)}
              </td>
              <td className={cn(cell, "text-destructive")}>
                {tzs(Math.max(0, totals.worthUsd - totals.collectedUsd), rate)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {rate === null
            ? t("No exchange rate published, so the shilling columns are blank.")
            : `1 USD = ${rate.toLocaleString()} TSh · ${t(
                "rates in the Total row are per kilo across the period, not column sums"
              )}`}
        </p>
        {canEdit ? (
          <SubmitButton
            variant="ghost"
            className="ml-auto h-9 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
            pendingLabel={t("Saving…")}
          >
            {t("Save freight & customs")}
          </SubmitButton>
        ) : null}
      </div>
      <FormError state={state} />
      {state.ok && state.data ? (
        <p className="mt-2 text-xs text-success">
          {state.data.saved} {t("flight(s) updated.")}
        </p>
      ) : null}

      {/* Kept, because the numbers above are only readable if the words are. */}
      <dl className="mt-6 grid gap-3 rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            t("Goods received"),
            t("Everything that landed, valued at what it is billed or priced at."),
          ],
          [
            t("Payback"),
            t("Weight × (freight + customs). What has to go back before anything is profit."),
          ],
          [
            t("Goods sold"),
            t("Weight whose bill is settled in full — cargo the company has actually been paid for."),
          ],
          [
            t("Actual received"),
            t("Money in, including part-payments on cargo that is not settled yet."),
          ],
        ].map(([term, meaning]) => (
          <div key={term}>
            <dt className="font-medium text-foreground">{term}</dt>
            <dd className="mt-0.5">{meaning}</dd>
          </div>
        ))}
      </dl>
    </form>
  );
}
