"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PaymentMethod } from "@prisma/client";
import { HandCoins, SlidersHorizontal } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useLocale, useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { setCreditLimit } from "@/lib/actions/credit";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  CREDIT_STATE_LABEL,
  CREDIT_TERMS,
  dueLabel,
  type CreditState,
  type CustomerCredit,
} from "@/lib/credit";
import type { CreditRow } from "@/lib/credit-queries";
import { formatDate } from "@/lib/format";
import { formatShillings, formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One customer's credit facility, their position against it, and every credit
 * they have ever held.
 *
 * The figure this panel exists for is AVAILABLE, and it is the limit minus their
 * whole exposure rather than minus the sale in front of you. A customer with a
 * USD 5,000 limit already owing 4,800 may take another 200 of cargo, not another
 * 5,000 — and whoever is deciding that is usually on the phone, which is why it
 * belongs on the customer's own page and not only in the credit book.
 *
 * Nothing here is arithmetic. Every figure arrives already derived by the credit
 * engine, because this panel and the settlements page answer the same questions,
 * and two code paths for one money question is the bug this app keeps getting
 * bitten by.
 *
 * Sold and collected stay in separate cells for the reason they do everywhere
 * else: a credit sale is revenue that happened and cash that did not. A cell
 * adding them would be a claim about the bank that is not true.
 */

const STATE_TONE: Record<CreditState, string> = {
  ACTIVE: "text-foreground",
  PARTIALLY_PAID: "text-brand",
  OVERDUE: "text-destructive",
  PAID: "text-success",
  WAIVED: "text-warning",
};

export type LastCreditPayment = {
  paidAt: Date;
  usd: number;
  /** The rate that money actually moved at, frozen. Never today's. */
  rate: number | null;
  method: PaymentMethod;
  invoiceId: string;
  invoiceNumber: string;
};

export function CustomerCreditPanel({
  customerId,
  position,
  rows,
  lastPayment,
  performance,
  waivedUsd,
  note,
  setAt,
  setBy,
  rate,
  canSetLimit,
  canCollect,
}: {
  customerId: string;
  position: CustomerCredit;
  rows: CreditRow[];
  lastPayment: LastCreditPayment | null;
  /** Null until they have settled something. An unproven customer scores nothing. */
  performance: { settled: number; late: number; onTimeRate: number } | null;
  waivedUsd: number;
  note: string | null;
  setAt: Date | null;
  setBy: string | null;
  /** Today's published rate. Totals only — a single bill uses its own. */
  rate: number | null;
  canSetLimit: boolean;
  canCollect: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  const money = (usd: number) => formatShillings(usd, rate);

  /*
    No facility, no history — so no panel, unless the reader can grant one.

    A card that exists to announce an absence is a card the desk learns to scroll
    past. Whoever holds credit.limit still needs the way in, so they keep a
    single line; everybody else gets nothing at all.
  */
  const bare = !position.hasFacility && rows.length === 0;
  if (bare && !canSetLimit) return null;

  const available = position.availableUsd;
  const availableTone =
    available === null
      ? "text-muted-foreground"
      : available < 0
        ? "text-destructive"
        : position.limitUsd !== null && available < position.limitUsd * 0.1
          ? "text-warning"
          : "text-success";

  const cells: { k: string; v: string; tone: string; hint?: string | null }[] = [
    {
      k: "Credit limit",
      v: position.limitUsd === null ? t("None") : money(position.limitUsd),
      tone: position.limitUsd === null ? "text-muted-foreground" : "",
    },
    {
      k: "Owed on credit",
      v: money(position.outstandingUsd),
      tone: position.outstandingUsd > 0.005 ? "text-brand" : "text-success",
      hint:
        position.openCount > 0
          ? `${position.openCount} ${t(position.openCount === 1 ? "open bill" : "open bills")}`
          : null,
    },
    {
      k: "Available",
      v: available === null ? t("No limit set") : money(available),
      tone: availableTone,
      hint:
        available !== null && available < 0
          ? t("over the limit")
          : position.hasFacility
            ? t("limit less everything they owe")
            : null,
    },
    { k: "Sold on credit", v: money(position.soldUsd), tone: "" },
    { k: "Collected", v: money(position.paidUsd), tone: "text-success" },
    {
      k: "Overdue",
      v: money(position.overdueUsd),
      tone:
        position.overdueUsd > 0.005 ? "text-destructive" : "text-muted-foreground",
      hint:
        position.overdueCount > 0
          ? `${position.overdueCount} ${t(position.overdueCount === 1 ? "bill late" : "bills late")}`
          : null,
    },
    {
      k: "Last payment",
      /* The payment's own frozen rate: this is one receipt the customer is
         holding, not a total across bills. */
      v: lastPayment
        ? formatShillings(lastPayment.usd, lastPayment.rate ?? rate)
        : t("Never"),
      tone: lastPayment ? "" : "text-muted-foreground",
      hint: lastPayment
        ? `${formatDate(lastPayment.paidAt, locale)} · ${t(PAYMENT_METHOD_LABELS[lastPayment.method])}`
        : null,
    },
    {
      k: "Pays on time",
      /* Said out loud when there is nothing to judge them on. A customer who has
         never settled anything must not be flattered with a perfect score. */
      v: performance ? `${performance.onTimeRate.toFixed(0)}%` : t("Unproven"),
      tone: performance
        ? performance.onTimeRate >= 90
          ? "text-success"
          : performance.onTimeRate >= 60
            ? "text-warning"
            : "text-destructive"
        : "text-muted-foreground",
      hint: performance
        ? `${performance.settled} ${t("settled")}${performance.late > 0 ? ` · ${performance.late} ${t("late")}` : ""}`
        : t("nothing settled yet"),
    },
  ];

  return (
    <section className="panel mb-6 overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2">
        <h2 className="min-w-0 text-sm font-semibold">
          {t("Credit")}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {position.hasFacility
              ? `${position.termDays} ${t("day terms")}`
              : t("no facility — nothing goes out unpaid without a decision")}
            {setAt
              ? ` · ${t("set")} ${formatDate(setAt, locale)}${setBy ? ` ${t("by")} ${setBy}` : ""}`
              : ""}
            {note ? ` · “${note}”` : ""}
          </span>
        </h2>
        {canSetLimit ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-accent"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {position.hasFacility ? t("Change limit") : t("Set a limit")}
          </button>
        ) : null}
      </header>

      {/*
        Eight figures, one strip.

        The owner's standing rule about every list and summary in this app is
        that the desk is busy and a screen of tall cards is a screen of
        scrolling — so this is a row of small cells, not eight panels, and the
        hint under a cell only appears when it has something to add.
      */}
      {bare ? null : (
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-8">
          {cells.map((cell) => (
            <div key={cell.k} className="bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{t(cell.k)}</dt>
              <dd
                className={cn(
                  "font-display text-sm font-bold tabular leading-tight",
                  cell.tone
                )}
              >
                {cell.v}
              </dd>
              {cell.hint ? (
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {cell.hint}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      )}

      {/* Forgiven money, stated. It is out of exposure by design, which is
          exactly why it has to be said: in every figure above, a customer the
          desk wrote two million off for looks like one who never borrowed. */}
      {waivedUsd > 0.005 ? (
        <p className="border-t px-4 py-1.5 text-[11px] text-warning">
          {money(waivedUsd)}{" "}
          {t("written off — out of what they owe, not out of their record")}
        </p>
      ) : null}

      {editing && canSetLimit ? (
        <CreditLimitForm
          customerId={customerId}
          limitUsd={position.limitUsd}
          termDays={position.termDays}
          note={note}
          outstandingUsd={position.outstandingUsd}
          rate={rate}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {/* The history, one line each — the credit book's own row shape, so a
          figure read here and a figure read there are the same figure. */}
      {rows.length > 0 ? (
        <ul className="divide-y border-t">
          {rows.map((r) => (
            <li
              key={r.invoiceId}
              className="px-4 py-2 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex min-w-0 items-baseline gap-2">
                  <Link
                    href={`/app/finance/invoices/${r.invoiceId}`}
                    className="truncate font-mono text-xs font-semibold hover:text-brand hover:underline"
                  >
                    {r.invoiceNumber}
                  </Link>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium",
                      STATE_TONE[r.state]
                    )}
                  >
                    {t(CREDIT_STATE_LABEL[r.state])}
                  </span>
                </p>
                <p className="shrink-0 text-right">
                  <span
                    className={cn(
                      "font-display text-sm font-bold tabular",
                      r.outstandingUsd > 0.005 ? STATE_TONE[r.state] : "text-success"
                    )}
                  >
                    {/* This bill's own frozen rate. A customer told TSh 202,500
                        must still read TSh 202,500 in six months. */}
                    {formatShillings(r.outstandingUsd, r.exchangeRate ?? rate)}
                  </span>
                  {r.paidUsd > 0.005 && r.outstandingUsd > 0.005 ? (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {t("of")} {formatUsd(r.totalUsd)}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                <p className="min-w-0 truncate font-mono">
                  {r.trackingNumber ?? "—"}
                  {r.batchNumber ? ` · ${r.batchNumber}` : ""}
                  {r.storageUsd > 0
                    ? ` · ${t("storage")} ${formatUsd(r.storageUsd)}`
                    : ""}
                </p>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      r.state === "OVERDUE" ? "font-semibold text-destructive" : ""
                    )}
                  >
                    {t(dueLabel(r))}
                  </span>
                  {r.dueDate ? (
                    <span className="tabular">{formatDate(r.dueDate, locale)}</span>
                  ) : null}
                  {/* An icon, not the word "Collect" printed down every row —
                      the owner asked for that on any action that repeats. */}
                  {canCollect && r.outstandingUsd > 0.005 ? (
                    <Link
                      href={`/app/collections/record/${r.invoiceId}`}
                      title={`${t("Record a payment on")} ${r.invoiceNumber}`}
                      aria-label={`${t("Record a payment on")} ${r.invoiceNumber}`}
                      className="focus-ring rounded p-0.5 text-success/80 transition-colors hover:bg-success/10 hover:text-success"
                    >
                      <HandCoins className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Setting the facility, and withdrawing it.
 *
 * An empty limit is not a mistake — it is how the facility is taken away. So the
 * form says that in words and the button changes to match, because a field that
 * looks like it failed validation gets "fixed" with a 0, and a limit of zero is
 * a different state from no limit at all while reading identically on screen.
 *
 * Withdrawing removes the right to take MORE cargo unpaid. It cancels nothing
 * already owed, and the warning carries that figure, because the desk doing this
 * is usually doing it to a customer who is already late.
 */
function CreditLimitForm({
  customerId,
  limitUsd,
  termDays,
  note,
  outstandingUsd,
  rate,
  onDone,
}: {
  customerId: string;
  limitUsd: number | null;
  termDays: number;
  note: string | null;
  outstandingUsd: number;
  rate: number | null;
  onDone: () => void;
}) {
  const t = useT();
  const [state, action] = useActionState(setCreditLimit, undefined);
  const [value, setValue] = useState(limitUsd === null ? "" : String(limitUsd));

  const withdrawing = value.trim().length === 0;

  return (
    <form action={action} className="space-y-2 border-t bg-muted/30 px-4 py-3">
      <input type="hidden" name="customerId" value={customerId} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          <span className="mb-0.5 block">{t("Credit limit (USD)")}</span>
          <Input
            name="limitUsd"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("empty withdraws it")}
            className="h-8 w-36 text-sm"
          />
        </label>

        <label className="text-[11px] text-muted-foreground">
          <span className="mb-0.5 block">{t("Terms")}</span>
          <select
            name="termDays"
            defaultValue={String(termDays)}
            className="focus-ring h-8 rounded-md border bg-card px-2 text-sm"
          >
            {CREDIT_TERMS.map((d) => (
              <option key={d} value={d}>
                {d} {t("days")}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[200px] flex-1 text-[11px] text-muted-foreground">
          <span className="mb-0.5 block">{t("Why")}</span>
          {/* Defaulted to what is on file. The action overwrites the note every
              time it runs, so an untouched field must not erase the reason
              somebody wrote for the last decision. */}
          <Input
            name="note"
            defaultValue={note ?? ""}
            placeholder={t("Reason for this facility")}
            className="h-8 w-full text-sm"
          />
        </label>

        <SubmitButton
          size="sm"
          className={cn(
            "h-8 px-3 text-xs",
            withdrawing ? "bg-destructive text-white hover:bg-destructive/90" : ""
          )}
          pendingLabel={t("Saving…")}
        >
          {withdrawing ? t("Withdraw facility") : t("Save limit")}
        </SubmitButton>

        <button
          type="button"
          onClick={onDone}
          className="focus-ring h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
        >
          {t("Cancel")}
        </button>
      </div>

      {withdrawing ? (
        <p className="text-[11px] text-warning">
          {t("An empty limit withdraws the facility — no more cargo goes out unpaid.")}
          {outstandingUsd > 0.005 ? (
            <span className="font-semibold">
              {" "}
              {formatShillings(outstandingUsd, rate)}{" "}
              {t("is already owed and stays owed — withdrawing collects nothing and cancels nothing.")}
            </span>
          ) : null}
        </p>
      ) : null}

      <FormError state={state} />
      {state?.ok ? <p className="text-[11px] text-success">{t("Saved.")}</p> : null}
    </form>
  );
}
