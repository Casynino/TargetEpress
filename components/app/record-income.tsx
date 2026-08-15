"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Plus, Search, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordPayment, searchBillable, type BillableHit } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";
import type { ExpenseAccount } from "@/components/app/expense-form";

const METHODS = [
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
];

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "USD" : "TSh"} ${n.toLocaleString("en-US", {
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  })}`;

/**
 * A bill in shillings, with the dollars underneath.
 *
 * The owner's rule, and it is about which currency this business actually runs
 * on: pricing is done in dollars, but customers pay in shillings and the office
 * counts in shillings. So every figure leads in TSh and carries the USD it was
 * billed at — never the other way round, which made a clerk convert in their
 * head before the number meant anything.
 */
function inShillings(usd: number, rate: number | null) {
  return rate === null ? null : `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`;
}

/**
 * Recording money that came in, from the ledger.
 *
 * The owner's flow, in his words: Finance decides to record an income, searches
 * a customer or a tracking number, picks the cargo, and enters what arrived.
 * So it is two steps and no navigation — find the bill, say what came in —
 * rather than sending somebody to Collections to hunt for an invoice first.
 *
 * Income here is never free text. Every shilling this business earns is earned
 * against one customer's cargo, so a payment is always attached to that bill:
 * it settles a real balance, it lands on a real account, and it produces a
 * receipt. A box that let somebody type "income, 500,000" would be the one
 * number on the page that reconciles against nothing.
 *
 * The heavy lifting is `recordPayment`, unchanged — the same action the
 * collections desk uses. That matters: the rules about which currency a bill
 * settles in, which rate converts it and what happens when it is paid in full
 * are written once and are already right.
 */
export function RecordIncome({
  accounts,
  rate,
  autoOpen = false,
}: {
  accounts: ExpenseAccount[];
  /** Today's USD→TZS, shown so nobody has to guess what a dollar bill is worth. */
  rate: number | null;
  /**
   * Open on arrival.
   *
   * Home links here to record an income rather than carrying its own copy of
   * this form, so somebody who pressed that button should land with the search
   * box in front of them, not with a button to press a second time.
   */
  autoOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BillableHit[]>([]);
  const [picked, setPicked] = useState<BillableHit | null>(null);
  /*
    The currency the money actually arrived in, which is not always the
    currency of the bill: a USD invoice is routinely settled in shillings at
    the counter.

    It is held in state because the account list depends on it. A payment
    cannot land in an account of another currency — the action refuses it, and
    rightly — so offering CRDB (TZS) for a payment marked USD is offering a
    choice that can only end in an error message. The list follows the switch.
  */
  const [tendered, setTendered] = useState<string>("TZS");
  /* Typed over freely; recomputed whenever the bill or the currency changes. */
  const [amount, setAmount] = useState<string>("");
  const [searching, startSearch] = useTransition();

  const [state, action] = useActionState<
    ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>,
    FormData
  >(recordPayment, { ok: true });

  /*
    Searched as it is typed, after a pause.

    A tracking number is fifteen keystrokes and a customer name is more, so
    firing on every one of them would be a query per letter for a result nobody
    has finished asking for. 250ms is long enough to cover typing and short
    enough that the list feels like it is keeping up.
  */
  useEffect(() => {
    if (picked) return;
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => setHits(await searchBillable(term)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, picked]);

  /* Once it saves, the panel resets rather than leaving a filled form that
     would record the same payment twice if somebody pressed again. */
  useEffect(() => {
    if (state.ok && state.data?.receiptNumber) {
      setPicked(null);
      setQuery("");
      setHits([]);
    }
  }, [state]);

  /*
    The rate this bill settles at — the one frozen onto the invoice, not
    today's.

    It matters for more than display. The action converts a shilling payment at
    the invoice's rate, so a shilling amount worked out at today's rate would
    credit slightly more or less than the balance and leave a bill a few
    hundred shillings short of settled. Converting at the same rate the action
    will use means "the whole balance" really is the whole balance.
  */
  const billRate = picked?.rate ?? rate;

  /** What the balance comes to in the currency the customer is handing over. */
  const owedIn = (hit: BillableHit, currency: string) => {
    const r = hit.rate ?? rate;
    if (currency === hit.currency) return hit.outstanding;
    if (r === null) return hit.outstanding;
    return currency === "TZS"
      ? Math.round(hit.outstanding * r)
      : Math.round((hit.outstanding / r) * 100) / 100;
  };

  /*
    Shillings by default, whatever the bill says.

    Pricing is in dollars; paying is not. A customer settling a USD bill hands
    over shillings at the counter almost every time, so the form opens on what
    is actually about to happen — and the amount opens as the shilling value of
    the whole balance rather than a dollar figure nobody in the room said.
  */
  const pick = (hit: BillableHit) => {
    const currency = "TZS";
    setPicked(hit);
    setTendered(currency);
    setAmount(String(owedIn(hit, currency)));
  };

  const switchCurrency = (currency: string) => {
    setTendered(currency);
    if (picked) setAmount(String(owedIn(picked, currency)));
  };

  const close = () => {
    setOpen(false);
    setPicked(null);
    setQuery("");
    setHits([]);
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-lg"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {t("Record an income")}
      </Button>
    );
  }

  /*
    An overlay, not a block in the page.

    The owner wants this button beside "Record a cost", which lives in the page
    header — and a panel cannot unfold inside a header. Floating it also means
    the same button works from anywhere: the ledger header today, Home's
    shortcut, wherever it is wanted next.
  */
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8">
      {/* Clicking the dark ground closes it; the panel above swallows its own
          clicks so a stray one inside the form does not throw the work away. */}
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className="absolute inset-0 cursor-default"
      />
      <section className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-success/30 bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-success/20 bg-success/[0.06] px-5 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-success">
          {t("Record an income")}
        </p>
        <button
          type="button"
          onClick={close}
          className="focus-ring rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t("Close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {state.ok && state.data?.receiptNumber ? (
        <p className="border-b border-success/20 px-5 py-2.5 text-sm text-success">
          <Check className="mr-1.5 inline h-4 w-4" />
          {t("Recorded")} · {state.data.receiptNumber}
          {state.data.pickupNoteNumber
            ? ` · ${t("pickup note")} ${state.data.pickupNoteNumber}`
            : ""}
        </p>
      ) : null}

      {picked === null ? (
        <div className="px-5 py-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Customer name, tracking number, invoice or phone…")}
              className="pl-9"
              aria-label={t("Find the bill")}
            />
          </label>

          {query.trim().length >= 2 ? (
            <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
              {searching && hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {t("Looking…")}
                </li>
              ) : hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {t("Nothing matches that. Try the tracking number.")}
                </li>
              ) : (
                hits.map((hit) => {
                  const settled = hit.outstanding <= 0;
                  return (
                    <li key={hit.invoiceId}>
                      <button
                        type="button"
                        /* A settled bill is shown and not pickable: the answer
                           to "has this been paid" is worth more than an empty
                           list, but it must not invite a second payment. */
                        disabled={settled}
                        onClick={() => pick(hit)}
                        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                      >
                        <span className="font-mono text-xs font-semibold">
                          {hit.trackingNumber}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {hit.customerName}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {hit.goods}
                          </span>
                        </span>
                        {settled ? (
                          <span className="text-xs text-success">
                            {t("settled")}
                          </span>
                        ) : (
                          <span className="text-right">
                            <span className="block text-sm font-semibold tabular-nums text-destructive">
                              {hit.currency === "TZS"
                                ? money(hit.outstanding, "TZS")
                                : (inShillings(hit.outstanding, hit.rate ?? rate) ??
                                  money(hit.outstanding, hit.currency))}
                            </span>
                            {hit.currency === "USD" ? (
                              <span className="block text-[11px] tabular-nums text-muted-foreground">
                                {money(hit.outstanding, "USD")}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Every income is against one customer's cargo, so start by finding the bill."
              )}
            </p>
          )}
        </div>
      ) : (
        <form action={action} className="px-5 py-4">
          <input type="hidden" name="invoiceId" value={picked.invoiceId} />

          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2.5">
            <span className="font-mono text-xs font-semibold">
              {picked.trackingNumber}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {picked.customerName}
              <span className="ml-2 text-xs text-muted-foreground">
                {picked.invoiceNumber}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {t("owes")}{" "}
              <span className="font-semibold tabular-nums text-destructive">
                {picked.currency === "TZS"
                  ? money(picked.outstanding, "TZS")
                  : (inShillings(picked.outstanding, billRate) ??
                    money(picked.outstanding, "USD"))}
              </span>
              {picked.currency === "USD" ? (
                <span className="ml-1.5 tabular-nums">
                  ({money(picked.outstanding, "USD")})
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t("pick another")}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {/* Pre-filled with the balance, because settling in full is what
                nearly every payment is — and editable, because part-payments
                are the rest. */}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("How much came in")}
              </span>
              <Input
                name="amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-36 bg-card tabular-nums"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("Paid in")}
              </span>
              <NativeSelect
                name="currency"
                value={tendered}
                onChange={(e) => switchCurrency(e.target.value)}
                className="w-28 bg-card"
              >
                <option value="TZS">TZS</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t("How")}</span>
              <NativeSelect name="method" defaultValue="MOBILE_MONEY" className="w-40 bg-card">
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="flex flex-col gap-1">
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {t("Into which account")}
              </span>
              <NativeSelect name="accountId" defaultValue="" className="w-52 bg-card">
                <option value="">{t("Say later")}</option>
                {accounts
                  .filter((a) => a.currency === tendered)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>

            {/*
              Proof, and nothing else to type.

              The reference box and the date box are gone. The date is stamped
              when Record is pressed — money is recorded as it is taken, and a
              field that is right by default should not cost a clerk a keystroke
              or the form a column. (paymentSchema already reads an empty
              paidAt as now, so nothing had to change in the action.) The
              M-Pesa code went with it: a photograph of the message says more
              than a code typed off it, and it is the thing that settles an
              argument months later.

              Optional, deliberately. Taking the money is the job; the evidence
              catches up. What arrives without proof is still visible as exactly
              that.
            */}
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("Proof")} <span className="opacity-70">{t("(optional)")}</span>
              </span>
              <Input
                name="proof"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="w-56 bg-card file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              />
            </label>

            <SubmitButton variant="brand" pendingLabel={t("Recording…")}>
              {t("Record it")}
            </SubmitButton>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {t(
              "It settles this bill, lands in that account and issues a receipt. A bill paid in full releases its cargo."
            )}
            {tendered !== picked.currency && rate
              ? ` ${t("Tendered in a different currency from the bill, so it converts at the rate on the bill.")}`
              : ""}
          </p>
          <FormError state={state} />
        </form>
      )}
      </section>
    </div>
  );
}
