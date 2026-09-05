"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Clock, LockOpen, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { reopenBatch, reviewStatement } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import type { IncomeRow, IncomeSheet } from "@/lib/income";
import { formatLocal } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Whole dollars: these are batches, not invoices. */
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
 * What each closed batch made, and whether the boss has agreed.
 *
 * Not a live grid. Every row is a statement written on the day its batch was
 * shut, in the two halves the department has always drawn — what landed on the
 * left, what was paid for on the right — plus the two things that leave a
 * batch without being paid for: cargo carried onto another batch, and cargo
 * given up on.
 *
 * The figures do not move again. That is the point of closing: a payment
 * arriving next week still changes what its customer owes, and still shows up
 * on that customer's account, but it does not rewrite what July's batch was
 * reported to have earned after the boss signed it.
 */
export function IncomeSheetTable({
  sheet,
  canReview,
  canReopen = false,
  rateNow = null,
}: {
  sheet: IncomeSheet;
  canReview: boolean;
  /** Reopening the batch itself, which is a bigger door than sending a
      statement back — it lets costs and payments land on it again. */
  canReopen?: boolean;
  /** Today's published rate, for the Total line only — each row keeps the
      rate its own batch closed at. */
  rateNow?: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [state, review] = useActionState<
    ActionResult<{ status: string }>,
    FormData
  >(reviewStatement, { ok: true });
  const [reopenState, reopen] = useActionState<
    ActionResult<Record<string, never>>,
    FormData
  >(reopenBatch, { ok: true });
  /** Which row is showing the reopen box. Asking for a reason is the point. */
  const [reopening, setReopening] = useState<string | null>(null);

  const { rows, totals } = sheet;
  /*
    Sent-back rows are shown but not counted, because their batch is open
    again. With one on screen and nothing else, the Total reads zero beside a
    row of real figures — correct, and indistinguishable from broken unless it
    says so.
  */
  const excluded = rows.filter((row) => row.status === "RETURNED").length;
  const cell = "px-2 py-2 text-right tabular-nums";
  const head =
    "px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide";
  /* Each statement keeps the rate it was closed at, so shillings never move. */
  const tsh = (n: number | null, rate: number | null) =>
    n === null || rate === null ? "—" : formatLocal(n * rate);
  /* The Total line is different: it is the figure Finance reads out TODAY, not
     a frozen statement, so it leads in shillings at today's published rate with
     the dollars it was priced from beneath. The rows above keep their own
     frozen rates. With no rate published, the dollar figure stands alone. */
  const totalMoney = (n: number | null) =>
    n === null ? (
      "—"
    ) : rateNow === null ? (
      usd(n)
    ) : (
      <>
        <span className="block">{formatLocal(n * rateNow)}</span>
        <span className="block text-[11px] font-normal text-muted-foreground">
          USD {usd(n)}
        </span>
      </>
    );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="font-medium">{t("No batches have been closed yet")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            "A batch lands here when Finance shuts its books. That is when the maths is done and the figures are frozen — until then it is still moving, and it is on the Batches board."
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      {/*
        Thirteen columns under three banded headings, and a 1,320px floor to
        keep them legible. That is the paper sheet the department has always
        drawn, and it cannot be squeezed onto a handset — so below md each batch
        becomes a card carrying the same three bands as labelled groups, and the
        Total row becomes the last card rather than a `tfoot` 1,320px to the
        right of where the reader is looking.
      */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const mark = STATE[row.status];
          const Icon = mark.icon;
          const bands = [
            {
              band: t("Goods received"),
              tone: "text-brand",
              facts: [
                { k: t("Kg"), v: row.kg.toFixed(1), tone: "" },
                { k: t("Rate"), v: perKg(row.sellRate), tone: "text-muted-foreground" },
                { k: "$", v: usd(row.worthUsd), tone: "" },
                { k: "TZS", v: tsh(row.worthUsd, row.rate), tone: "" },
                { k: t("Costs"), v: usd(row.expensesUsd), tone: "text-destructive" },
                {
                  k: t("Profit"),
                  v: usd(row.profitUsd),
                  tone:
                    row.profitUsd !== null && row.profitUsd < 0
                      ? "font-medium text-destructive"
                      : "font-medium",
                },
              ],
            },
            {
              band: t("Goods sold"),
              tone: "text-success",
              facts: [
                { k: t("Kg"), v: row.soldKg.toFixed(1), tone: "" },
                { k: "$", v: usd(row.soldUsd), tone: "" },
                {
                  k: t("Actual received"),
                  v: tsh(row.collectedUsd, row.rate),
                  tone: "text-success",
                },
              ],
            },
            {
              band: t("Left unpaid"),
              tone: "text-muted-foreground",
              facts: [
                {
                  k: t("Carried kg"),
                  v: row.carriedKg > 0 ? row.carriedKg.toFixed(1) : "—",
                  tone: "text-muted-foreground",
                },
                {
                  k: t("Written off"),
                  v: row.writtenOffUsd > 0 ? usd(row.writtenOffUsd) : "—",
                  tone: "text-destructive",
                },
              ],
            },
          ];

          return (
            <li key={row.batchId} className="rounded-xl border bg-card p-3 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/shipments/${row.batchId}`}
                  className="focus-ring rounded font-mono text-sm font-semibold hover:underline"
                >
                  {row.batchNumber}
                </Link>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]",
                    mark.tone
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {t(mark.label)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.closedLabel}
                </span>
              </div>

              {bands.map((group) => (
                <div key={group.band} className="mt-2.5">
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      group.tone
                    )}
                  >
                    {group.band}
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {group.facts.map((fact) => (
                      <div key={fact.k} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{fact.k}</dt>
                        <dd className={cn("truncate tabular-nums", fact.tone)}>
                          {fact.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setOpen(open === row.batchId ? null : row.batchId)}
                aria-expanded={open === row.batchId}
                className="focus-ring mt-3 flex min-h-[44px] w-full items-center justify-center rounded-lg border text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                {open === row.batchId
                  ? t("Hide the statement")
                  : t("Open the statement")}
              </button>
            </li>
          );
        })}

        <li className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide">
            {t("Total")}
            {excluded > 0 ? (
              <span className="ml-1.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                {t("without")} {excluded} {t("sent back")}
              </span>
            ) : null}
          </p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-medium">
            {[
              { k: t("Kg"), v: totals.kg.toFixed(1), tone: "" },
              /* Weighted, not summed: dollars-per-kilo cannot be added to
                 dollars-per-kilo and mean anything. */
              { k: t("Rate"), v: perKg(totals.sellRate), tone: "text-muted-foreground" },
              /* "Billed" rather than the table's "$": the figure leads in
                 shillings here, so a dollar sign over it would mislabel it. */
              { k: t("Billed"), v: totalMoney(totals.worthUsd), tone: "" },
              { k: t("Costs"), v: totalMoney(totals.expensesUsd), tone: "text-destructive" },
              { k: t("Profit"), v: totalMoney(totals.profitUsd), tone: "" },
              { k: t("Goods sold"), v: `${totals.soldKg.toFixed(1)} kg`, tone: "" },
              { k: t("Actual received"), v: totalMoney(totals.collectedUsd), tone: "text-success" },
              { k: t("Carried kg"), v: totals.carriedKg.toFixed(1), tone: "text-muted-foreground" },
              { k: t("Written off"), v: totalMoney(totals.writtenOffUsd), tone: "text-destructive" },
            ].map((fact) => (
              <div key={fact.k} className="min-w-0">
                <dt className="text-xs font-normal text-muted-foreground">
                  {fact.k}
                </dt>
                <dd className={cn("truncate tabular-nums", fact.tone)}>{fact.v}</dd>
              </div>
            ))}
          </dl>
        </li>
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-soft md:block">
        <table className="w-full min-w-[1320px] text-sm">
          <thead>
            <tr className="border-b">
              <th colSpan={2} className="px-3 py-1.5" />
              <th
                colSpan={6}
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
              <th className={head}>{t("Costs")}</th>
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
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]",
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
                  <td className={cn(cell, "text-destructive")}>
                    {usd(row.expensesUsd)}
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
                {excluded > 0 ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-[11px] text-muted-foreground">
                    {t("without")} {excluded} {t(excluded === 1 ? "sent back" : "sent back")}
                  </span>
                ) : null}
              </td>
              <td />
              <td className={cell}>{totals.kg.toFixed(1)}</td>
              {/* Weighted, not summed: dollars-per-kilo cannot be added to
                  dollars-per-kilo and mean anything. */}
              <td className={cn(cell, "text-muted-foreground")}>
                {perKg(totals.sellRate)}
              </td>
              {/* One cell across the $ and TZS pair: the rows' TZS column sums
                  figures frozen at different rates, so a column total there
                  would be a number no single rate produced. The Total states
                  both currencies itself instead. */}
              <td colSpan={2} className={cell}>
                {totalMoney(totals.worthUsd)}
              </td>
              <td className={cn(cell, "text-destructive")}>
                {totalMoney(totals.expensesUsd)}
              </td>
              <td className={cell}>{totalMoney(totals.profitUsd)}</td>
              <td className={cn(cell, "border-l")}>{totals.soldKg.toFixed(1)}</td>
              <td className={cell}>{totalMoney(totals.soldUsd)}</td>
              <td className={cn(cell, "text-success")}>
                {totalMoney(totals.collectedUsd)}
              </td>
              <td className={cn(cell, "border-l text-muted-foreground")}>
                {totals.carriedKg.toFixed(1)}
              </td>
              <td className={cn(cell, "text-destructive")}>
                {totalMoney(totals.writtenOffUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "Each row is frozen at the day its batch closed, including the exchange rate. The Total row's shillings are priced at today's published rate, and its per-kilo rates are weighted across the period, not column sums."
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
                        <span className="font-medium">{t("Sent back")}:</span>{" "}
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
                      "Profit",
                      usd(row.profitUsd),
                      t("billed less what it cost"),
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
                        "Confirming makes this the final word on the batch. Sending it back reopens it so Finance can fix what is wrong."
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

                {/*
                  The way back into the batch itself.

                  Sending a statement back reopens the books for Finance to
                  correct the figures. Reopening the BATCH is bigger: cargo can
                  move, costs can land, the statement is torn up. Both belong
                  here, because this is the page somebody is on when they find
                  the one that is wrong — but they are not the same button and
                  they do not look like it.
                */}
                {canReopen ? (
                  reopening === row.batchId ? (
                    <form
                      action={reopen}
                      className="flex flex-wrap items-end gap-2 border-t bg-muted/25 px-5 py-3"
                    >
                      <input type="hidden" name="batchId" value={row.batchId} />
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {t("Note (optional)")}
                        </span>
                        <Input
                          name="reason"
                          placeholder={t("A customs receipt turned up late")}
                          className="h-9 bg-card text-sm"
                        />
                      </label>
                      <SubmitButton
                        variant="ghost"
                        className="h-9 gap-1.5 border border-signal/35 bg-signal/10 px-3 text-signal hover:bg-signal/20 hover:text-signal"
                        pendingLabel={t("Reopening…")}
                      >
                        <LockOpen className="h-4 w-4" />
                        {t("Reopen the batch")}
                      </SubmitButton>
                      <button
                        type="button"
                        onClick={() => setReopening(null)}
                        className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("Leave it closed")}
                      </button>
                      <p className="w-full text-[11px] text-muted-foreground">
                        {t(
                          "Its statement is torn up and the figures start moving again. The boss is told."
                        )}
                      </p>
                      <FormError state={reopenState} />
                    </form>
                  ) : (
                    <div className="border-t px-5 py-2.5">
                      <button
                        type="button"
                        onClick={() => setReopening(row.batchId)}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        {t("Reopen this batch")}
                      </button>
                    </div>
                  )
                ) : null}
              </section>
            ))
        : null}
    </>
  );
}
