"use client";

import { useActionState, useMemo, useState } from "react";
import { Banknote, Wallet } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { recordCustomerPayment } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

export type OpenBill = {
  invoiceId: string;
  invoiceNumber: string;
  trackingNumber: string;
  description: string;
  currency: string;
  outstanding: number;
};

/**
 * One transfer, spread across the bills it answers.
 *
 * The arithmetic is the screen. A clerk holding a customer's M-Pesa message for
 * TSh 330,000 and three unpaid consignments needs to see, at every keystroke,
 * how much of it is still in their hand — so Received, Allocated and Left over
 * are always on the page, and Left over is a fact rather than an error. Money
 * beyond the bills stays with the customer as credit; forcing it onto an
 * invoice is how a balance nobody can explain gets created.
 *
 * The one thing it will not let you do is allocate more than arrived. Everything
 * else the server checks again — a bill's balance can move between opening this
 * page and pressing the button, and only the figures read inside the
 * transaction are current.
 */
export function CustomerPaymentForm({
  customerId,
  customerName,
  bills,
  accounts,
}: {
  customerId: string;
  customerName: string;
  bills: OpenBill[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ receiptNumber: string; settled: number }>,
    FormData
  >(recordCustomerPayment, { ok: true });

  const [currency, setCurrency] = useState(bills[0]?.currency ?? "TZS");
  const [received, setReceived] = useState("");
  /** invoiceId → what the clerk has typed against it. */
  const [shares, setShares] = useState<Record<string, string>>({});

  const payable = useMemo(
    () => bills.filter((b) => b.currency === currency),
    [bills, currency]
  );

  const receivedNum = Number(received) || 0;
  const allocations = payable
    .map((b) => ({ invoiceId: b.invoiceId, amount: Number(shares[b.invoiceId]) || 0 }))
    .filter((a) => a.amount > 0);
  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  const left = receivedNum - allocated;
  const over = left < -0.005;

  const money = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  /** Fill downwards from what is left, oldest bill first. */
  function spread() {
    let remaining = receivedNum;
    const next: Record<string, string> = {};
    for (const bill of payable) {
      const take = Math.min(remaining, bill.outstanding);
      if (take > 0.005) next[bill.invoiceId] = String(Number(take.toFixed(2)));
      remaining -= take;
      if (remaining <= 0.005) break;
    }
    setShares(next);
  }

  if (state.ok && state.data) {
    return (
      <div className="panel space-y-2 border-success/40 p-5">
        <p className="font-display text-lg font-bold text-success">
          {t("Payment recorded")} — {state.data.receiptNumber}
        </p>
        <p className="text-sm text-muted-foreground">
          {state.data.settled} {t("bill(s) settled in full.")}{" "}
          {t("The account moved once, for the money that actually arrived.")}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="customerId" value={customerId} />
      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(allocations)}
      />

      <FormError state={state} />

      <section className="panel space-y-4 p-5">
        <h2 className="font-display font-semibold">
          {t("What arrived from")} {customerName}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">{t("Amount received")}</Label>
            <MoneyInput
              id="amount"
              name="amount"
              value={received}
              onValueChange={setReceived}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">{t("Currency")}</Label>
            <NativeSelect
              id="currency"
              name="currency"
              className="h-11"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                /* Bills in the old currency are no longer on the page, so their
                   shares must not travel with the form. */
                setShares({});
              }}
            >
              <option value="TZS">TZS</option>
              <option value="USD">USD</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="method">{t("How it was paid")}</Label>
            <NativeSelect id="method" name="method" className="h-11" defaultValue="MOBILE_MONEY">
              <option value="MOBILE_MONEY">{t("Mobile money")}</option>
              <option value="CASH">{t("Cash")}</option>
              <option value="BANK_TRANSFER">{t("Bank transfer")}</option>
              <option value="CHEQUE">{t("Cheque")}</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">{t("Reference")}</Label>
            <Input
              id="reference"
              name="reference"
              className="h-11"
              placeholder={t("M-Pesa code, slip number")}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="accountId">{t("Which account did it land in?")}</Label>
            <NativeSelect id="accountId" name="accountId" className="h-11" defaultValue="">
              <option value="">{t("Not said yet")}</option>
              {accounts
                .filter((a) => a.currency === currency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">{t("Note")}</Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="font-display font-semibold">
            {t("Which bills does it settle?")}
          </h2>
          <button
            type="button"
            onClick={spread}
            disabled={receivedNum <= 0}
            className="focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {t("Spread it, oldest first")}
          </button>
        </header>

        {payable.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t("This customer has no open bills in this currency.")}
          </p>
        ) : (
          <ul className="divide-y">
            {payable.map((bill) => (
              <li
                key={bill.invoiceId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {bill.trackingNumber}{" "}
                    <span className="text-muted-foreground">{bill.description}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {bill.invoiceNumber} · {t("owes")}{" "}
                    {bill.currency} {bill.outstanding.toLocaleString()}
                  </p>
                </div>
                <div className="w-36 shrink-0">
                  {/* Named for the browser's sake only — the server reads the
                      allocations off the hidden JSON field, which is the one
                      place the pairs stay together. */}
                  <MoneyInput
                    name={`share_${bill.invoiceId}`}
                    aria-label={`${t("Allocate to")} ${bill.invoiceNumber}`}
                    value={shares[bill.invoiceId] ?? ""}
                    onValueChange={(raw) =>
                      setShares((prev) => ({ ...prev, [bill.invoiceId]: raw }))
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The three figures the clerk is actually watching. Left over is a
            fact, not a fault — it stays with the customer as credit. */}
        <footer className="grid grid-cols-3 gap-3 border-t bg-muted/20 px-5 py-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("Received")}</p>
            <p className="font-display font-bold tabular-nums">{money(receivedNum)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("Allocated")}</p>
            <p className="font-display font-bold tabular-nums">{money(allocated)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {over ? t("Over-allocated") : t("Left as customer credit")}
            </p>
            <p
              className={`font-display font-bold tabular-nums ${
                over ? "text-destructive" : left > 0.005 ? "text-warning" : ""
              }`}
            >
              {money(Math.abs(left))}
            </p>
          </div>
        </footer>
      </section>

      {over ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {t(
            "You have put more against bills than the customer sent. Reduce a share, or raise the amount received."
          )}
        </p>
      ) : null}

      <SubmitButton
        disabled={over || receivedNum <= 0 || allocations.length === 0}
        pendingLabel="Recording…"
      >
        {left > 0.005 ? (
          <Wallet className="mr-2 h-4 w-4" />
        ) : (
          <Banknote className="mr-2 h-4 w-4" />
        )}
        {t("Record")} {money(receivedNum)}
      </SubmitButton>
    </form>
  );
}
