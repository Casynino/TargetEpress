"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Clock, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { reviewStatement } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import type { IncomeRow, IncomeSheet } from "@/lib/income";
import { formatLocal } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Whole dollars: these are flights, not invoices. */
const usd = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
/** A per-kilo rate. Two places, because 12.5 and 1.8 are the whole point. */
const perKg = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const STATE: Record<
  IncomeRow["status"],
  { label: string; tone: string; icon: typeof Check }
> = {
  SUBMITTED: {
    label: "With the boss",
    tone: "bg-warning/10 text-warning border-warning/30",
    icon: Clock,
  },
  CONFIRMED: {
    label: "Confirmed",
    tone: "bg-success/10 text-success border-success/30",
    icon: Check,
  },
  RETURNED: {
    label: "Sent back",
    tone: "bg-destructive/10 text-destructive border-destructive/30",
    icon: Undo2,
  },
};

/**
 * What each closed flight made, and whether the boss has agreed.
 *
 * Not a live grid. Every row is a statement written on the day its flight was
 * shut, in the two halves the department has always drawn — what landed on the
 * left, what was paid for on the right — plus the two things that leave a
 * flight without being paid for: cargo carried onto another batch, and cargo
 * given up on.
 *
 * The figures do not move again. That is the point of closing: a payment
 * arriving next week still changes what its customer owes, and still shows up
 * on that customer's account, but it does not rewrite what July's flight was
 * reported to have earned after the boss signed it.
 */
export function IncomeSheetTable({
  sheet,
  canReview,
}: {
  sheet: IncomeSheet;
  canReview: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [state, review] = useActionState<
    ActionResult<{ status: string }>,
    FormData
  >(reviewStatement, { ok: true });

  const { rows, totals } = sheet;
  const cell = "px-2 py-2 text-right tabular-nums";
  const head =
    "px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide";
  /* Each statement keeps the rate it was closed at, so shillings never move. */
  const tsh = (n: number | null, rate: number | null) =>
    n === null || rate === null ? "—" : formatLocal(n * rate);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="font-medium">{t("No flights have been closed yet")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            "A flight lands here when Finance shuts its books. That is when the maths is done and the figures are frozen — until then it is still moving, and it is on the Shipments board."
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full min-w-[1320px] text-sm">
          <thead>
            <tr className="border-b">
              <th colSpan={2} className="px-3 py-1.5" />
              <th
                colSpan={9}
                className="bg-brand/10 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand"
              >
                {t("Goods received")}
              </th>
              <th
                colSpan={3}
                className="border-l bg-success/10 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-success"
              >
                {t("Goods sold")}
              </th>
              {/* The third thing that happens to cargo, which the paper sheet
                  has no column for at all: it leaves without being paid for. */}
              <th
                colSpan={2}
                className="border-l bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t("Left unpaid")}
              </th>
            </tr>
            <tr className="border-b text-muted-foreground">
              <th className={cn(head, "text-left")}>{t("Batch")}</th>
              <th className={cn(head, "text-left")}>{t("Closed")}</th>
              <th className={head}>{t("Kg")}</th>
              <th className={head}>{t("Rate")}</th>
              <th className={head}>$</th>
              <th className={head}>TZS</th>
              <th className={head}>{t("Freight")}</th>
              <th className={head}>{t("Customs")}</th>
              <th className={head}>{t("Payback")}</th>
              <th className={head}>{t("Profit rate")}</th>
              <th className={head}>{t("Profit")}</th>
              <th className={cn(head, "border-l")}>{t("Kg")}</th>
              <th className={head}>$</th>
              <th className={head}>{t("Actual received")}</th>
              <th className={cn(head, "border-l")}>{t("Carried kg")}</th>
              <th className={head}>{t("Written off")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {rows.map((row) => {
              const mark = STATE[row.status];
              const Icon = mark.icon;
              return (
                <tr
                  key={row.batchId}
                  className="cursor-pointer transition-colors hover:bg-muted/20"
                  onClick={() => setOpen(open === row.batchId ? null : row.batchId)}
                >
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/app/shipments/${row.batchId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {row.batchNumber}
                      </Link>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                          mark.tone
                        )}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {t(mark.label)}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {row.closedLabel}
                  </td>
                  <td className={cell}>{row.kg.toFixed(1)}</td>
                  <td className={cn(cell, "text-muted-foreground")}>
                    {perKg(row.sellRate)}
                  </td>
                  <td className={cell}>{usd(row.worthUsd)}</td>
                  <td className={cell}>{tsh(row.worthUsd, row.rate)}</td>
                  <td className={cn(cell, "text-muted-foreground")}>
                    {perKg(row.freightRate)}
                  </td>
                  <td className={cn(cell, "text-muted-foreground")}>
                    {perKg(row.customsRate)}
                  </td>
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
                    {tsh(row.collectedUsd, row.rate)}
                  </td>
                  <td className={cn(cell, "border-l text-muted-foreground")}>
                    {row.carriedKg > 0 ? row.carriedKg.toFixed(1) : "—"}
                  </td>
                  <td className={cn(cell, "text-destructive")}>
                    {row.writtenOffUsd > 0 ? usd(row.writtenOffUsd) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-2 py-2 text-xs uppercase tracking-wide">
                {t("Total")}
              </td>
              <td />
              <td className={cell}>{totals.kg.toFixed(1)}</td>
              {/* Weighted, not summed: dollars-per-kilo cannot be added to
                  dollars-per-kilo and mean anything. */}
              <td className={cn(cell, "text-muted-foreground")}>
                {perKg(totals.sellRate)}
              </td>
              <td className={cell}>{usd(totals.worthUsd)}</td>
              <td />
              <td />
              <td />
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
                {usd(totals.collectedUsd)}
              </td>
              <td className={cn(cell, "border-l text-muted-foreground")}>
                {totals.carriedKg.toFixed(1)}
              </td>
              <td className={cn(cell, "text-destructive")}>
                {usd(totals.writtenOffUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "Each row is frozen at the day its flight closed, including the exchange rate. The Total row's rates are per kilo across the period, not column sums."
        )}
      </p>

      {/* The statement the row belongs to, opened by clicking it. Kept off the
          table because a review needs sentences and a table needs columns. */}
      {open
        ? rows
            .filter((row) => row.batchId === open)
            .map((row) => (
              <section
                key={row.batchId}
                className="mt-4 overflow-hidden rounded-xl border bg-card shadow-soft"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-3">
                  <h2 className="font-display font-semibold">
                    {row.batchNumber}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {t("closed")} {row.closedLabel}
                    {row.submittedBy ? ` ${t("by")} ${row.submittedBy}` : ""}
                  </span>
                  {row.reviewedBy ? (
                    <span className="text-xs text-muted-foreground">
                      ·{" "}
                      {row.status === "CONFIRMED"
                        ? t("confirmed by")
                        : t("sent back by")}{" "}
                      {row.reviewedBy}
                    </span>
                  ) : null}
                </div>

                {row.note || row.reviewNote ? (
                  <div className="space-y-1 border-b px-5 py-2 text-xs">
                    {row.note ? (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {t("Finance")}:
                        </span>{" "}
                        {row.note}
                      </p>
                    ) : null}
                    {row.reviewNote ? (
                      <p className="text-destructive">
                        <span className="font-medium">{t("Boss")}:</span>{" "}
                        {row.reviewNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    ["Landed", `${row.kg.toFixed(1)} kg`, usd(row.worthUsd)],
                    ["Paid for", `${row.soldKg.toFixed(1)} kg`, usd(row.soldUsd)],
                    [
                      "Carried on",
                      `${row.carriedKg.toFixed(1)} kg`,
                      usd(row.carriedUsd),
                    ],
                    [
                      "Written off",
                      `${row.writtenOffKg.toFixed(1)} kg`,
                      usd(row.writtenOffUsd),
                    ],
                    ["Local costs", usd(row.expensesUsd), t("clearing, transport")],
                    [
                      "Payback",
                      usd(row.paybackUsd),
                      `${perKg(row.landedRate)} ${t("per kg")}`,
                    ],
                  ].map(([label, big, small]) => (
                    <div key={label} className="bg-card px-4 py-3">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t(label)}
                      </dt>
                      <dd className="mt-0.5 font-display text-base font-bold tabular-nums">
                        {big}
                      </dd>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {small}
                      </p>
                    </div>
                  ))}
                </dl>

                {canReview && row.status !== "CONFIRMED" ? (
                  <form action={review} className="border-t bg-muted/25 px-5 py-3">
                    <input type="hidden" name="batchId" value={row.batchId} />
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t(
                        "Confirming makes this the final word on the flight. Sending it back reopens it so Finance can fix what is wrong."
                      )}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {t("Note (required to send it back)")}
                        </span>
                        <Input
                          name="reviewNote"
                          placeholder={t("The freight rate looks wrong")}
                          className="h-9 bg-card text-sm"
                        />
                      </label>
                      <SubmitButton
                        name="decision"
                        value="CONFIRMED"
                        variant="ghost"
                        className="h-9 gap-1.5 border border-success/35 bg-success/10 px-3 text-success hover:bg-success/20 hover:text-success"
                        pendingLabel={t("Confirming…")}
                      >
                        <Check className="h-4 w-4" />
                        {t("Confirm")}
                      </SubmitButton>
                      <SubmitButton
                        name="decision"
                        value="RETURNED"
                        variant="ghost"
                        className="h-9 gap-1.5 border border-destructive/35 bg-destructive/10 px-3 text-destructive hover:bg-destructive/20 hover:text-destructive"
                        pendingLabel={t("Sending back…")}
                      >
                        <Undo2 className="h-4 w-4" />
                        {t("Send back")}
                      </SubmitButton>
                    </div>
                    <FormError state={state} />
                  </form>
                ) : null}
              </section>
            ))
        : null}
    </>
  );
}
