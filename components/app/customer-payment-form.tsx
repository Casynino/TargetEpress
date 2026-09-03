"use client";

import { useActionState, useMemo, useState } from "react";
import { Banknote, SlidersHorizontal, Wallet } from "lucide-react";

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
  /** The rate frozen onto this bill — what a payment in another currency
      converts at. Null on bills raised before rates were stored. */
  exchangeRate: number | null;
};

const LOCAL = "TZS";

/**
 * TICK THE CARGO. RECORD THE PAYMENT.
 *
 * The first version of this asked the clerk to type a figure against each bill.
 * That is the accountant's model of the job — allocations, distribution,
 * splitting — and it is not what happens at the counter. What happens is: this
 * customer has three consignments, they have paid for all three, take the
 * money. Somebody typing 100,000 then 150,000 then 80,000 to describe one
 * 330,000 transfer is doing arithmetic the system already knows.
 *
 * So selection is the whole flow. Tick the bills, the total fills itself in,
 * press the button. Typing a share is the exception, kept behind a toggle for
 * the day a customer pays part of one — because that day does come, and the
 * flow for it must not be the flow for every other day.
 *
 * Nothing about the cargo is merged. Each consignment keeps its own tracking
 * number, batch, weight, storage clock, bill and pickup note; the only thing
 * being grouped is the act of paying. That distinction is the whole design.
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

  /*
    TWO CURRENCIES, AND THEY ARE DIFFERENT QUESTIONS.

    `billCurrency` is which bills are being settled — the customer's dollar
    bills or, rarely, their shilling ones. `payCurrency` is what they actually
    handed over, which for this business is nearly always shillings against a
    dollar bill. Conflating the two is what made the screen refuse the most
    common payment it will ever be asked to take.
  */
  const [billCurrency, setBillCurrency] = useState(bills[0]?.currency ?? "TZS");
  const [payCurrency, setPayCurrency] = useState(bills[0]?.currency ?? "TZS");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /* Only ever consulted in split mode. A share typed, then abandoned by
     unticking the bill, must not travel with the form. */
  const [shares, setShares] = useState<Record<string, string>>({});
  const [split, setSplit] = useState(false);
  /** Null while the total is following the selection, which is nearly always. */
  const [typedTotal, setTypedTotal] = useState<string | null>(null);

  const payable = useMemo(
    () => bills.filter((b) => b.currency === billCurrency),
    [bills, billCurrency]
  );

  /*
    One rate for the whole payment, off the bills themselves — the same rule the
    action enforces, checked here so the screen never offers a payment the
    server will refuse. Bills quoted at two different rates, or one carrying no
    rate at all, can only be settled one at a time.
  */
  const rate = useMemo(() => {
    const rates = new Set(payable.map((b) => b.exchangeRate));
    return rates.size === 1 ? [...rates][0] : null;
  }, [payable]);
  const canCross = rate !== null && rate > 0;
  const cross = payCurrency !== billCurrency;

  /** A bill's figure, restated in what the customer is handing over. */
  const inPay = (billAmount: number) => {
    if (!cross || !rate) return billAmount;
    const converted =
      payCurrency === LOCAL ? billAmount * rate : billAmount / rate;
    /* Shillings are whole numbers at a counter; cents are not handed over. */
    return payCurrency === LOCAL
      ? Math.round(converted)
      : Math.round(converted * 100) / 100;
  };

  const allocations = payable
    .filter((b) => picked.has(b.invoiceId))
    .map((b) => ({
      invoiceId: b.invoiceId,
      /* Sent in the currency that ARRIVED. The server converts each one back at
         the bill's own frozen rate and settles the bill in its own money. */
      amount: split
        ? Number(shares[b.invoiceId] ?? inPay(b.outstanding)) || 0
        : inPay(b.outstanding),
    }))
    .filter((a) => a.amount > 0);

  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  /* The figure the customer actually sent. It follows what was ticked until
     somebody says otherwise, because in the ordinary case they are the same
     number and asking for it twice is how a 330,000 becomes a 33,000. */
  const received = typedTotal === null ? allocated : Number(typedTotal) || 0;
  const left = received - allocated;
  const over = left < -0.005;

  const money = (n: number, currency = payCurrency) =>
    `${currency === LOCAL ? "TSh" : currency} ${n.toLocaleString(undefined, {
      maximumFractionDigits: currency === LOCAL ? 0 : 2,
    })}`;

  function toggle(invoiceId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
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
      <input type="hidden" name="currency" value={payCurrency} />
      <input type="hidden" name="amount" value={received || ""} />
      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(allocations)}
      />

      <FormError state={state} />

      {/* THE JOB, FIRST. Which cargo is this customer paying for. */}
      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="font-display font-semibold">
              {t("Which cargo are they paying for?")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("Tick everything this payment covers. Tick nothing and it is held as their credit until their cargo lands.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {bills.some((b) => b.currency !== billCurrency) ? (
              <NativeSelect
                aria-label={t("Which bills")}
                className="h-9 w-28"
                value={billCurrency}
                onChange={(e) => {
                  setBillCurrency(e.target.value);
                  /* The money follows the bills by default; a customer paying
                     for their dollar cargo is quoted in dollars first. */
                  setPayCurrency(e.target.value);
                  /* Bills in the old currency have left the page; their
                     selections must not be submitted from behind it. */
                  setPicked(new Set());
                  setShares({});
                  setTypedTotal(null);
                }}
              >
                <option value="TZS">{t("TSh bills")}</option>
                <option value="USD">{t("USD bills")}</option>
              </NativeSelect>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setPicked(
                  picked.size === payable.length
                    ? new Set()
                    : new Set(payable.map((b) => b.invoiceId))
                )
              }
              className="focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold"
            >
              {picked.size === payable.length && payable.length > 0
                ? t("Clear")
                : t("Select all")}
            </button>
          </div>
        </header>

        {payable.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t("This customer has no open bills in this currency.")}
          </p>
        ) : (
          <ul className="divide-y">
            {payable.map((bill) => {
              const on = picked.has(bill.invoiceId);
              return (
                <li key={bill.invoiceId}>
                  {/* The whole row is the target. A 16px checkbox is not a
                      thing to aim at on a warehouse phone. */}
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-accent/40">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(bill.invoiceId)}
                      className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {bill.trackingNumber}{" "}
                        <span className="text-muted-foreground">
                          {bill.description}
                        </span>
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {bill.invoiceNumber}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-sm font-bold tabular-nums">
                        {money(inPay(bill.outstanding))}
                      </span>
                      {/* What the bill itself says, kept in view: the customer
                          is handing over shillings, but the document they were
                          given and the balance that clears are in dollars. */}
                      {cross ? (
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {money(bill.outstanding, bill.currency)}
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {/* Only when somebody has asked to pay part of a bill. */}
                  {split && on ? (
                    <div className="flex items-center justify-end gap-2 px-5 pb-3">
                      <span className="text-xs text-muted-foreground">
                        {t("Put against this bill")}
                      </span>
                      <div className="w-36">
                        <MoneyInput
                          name={`share_${bill.invoiceId}`}
                          aria-label={`${t("Put against this bill")} ${bill.invoiceNumber}`}
                          value={shares[bill.invoiceId] ?? String(bill.outstanding)}
                          onValueChange={(raw) =>
                            setShares((prev) => ({
                              ...prev,
                              [bill.invoiceId]: raw,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {picked.size} {t("selected")}
            </p>
            <p className="font-display text-lg font-bold tabular-nums">
              {money(allocated)}
            </p>
          </div>
          {/* The exception, and it looks like one. */}
          <button
            type="button"
            onClick={() => setSplit((v) => !v)}
            className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {split ? t("Pay them in full") : t("They are paying part of a bill")}
          </button>
        </footer>
      </section>

      {/* THE MONEY, SECOND. Pre-filled from what was ticked. */}
      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-semibold">
            {t("What arrived from")} {customerName}
          </h2>

          {/*
            The bills are in dollars and the money is in shillings, which is the
            ordinary case here, not the exception. Offered only when the bills
            agree on one rate — the server refuses the rest, and a screen that
            offers what the server refuses is worse than one that does not.
          */}
          {canCross ? (
            <div className="inline-flex rounded-full border p-0.5">
              {[billCurrency, billCurrency === LOCAL ? "USD" : LOCAL].map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setPayCurrency(option);
                      /* Every figure on the page has just changed unit. A total
                         typed in the old one would now mean something else. */
                      setTypedTotal(null);
                      setShares({});
                    }}
                    className={`focus-ring rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      payCurrency === option
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Paid in")} {option === LOCAL ? "TSh" : "USD"}
                  </button>
                )
              )}
            </div>
          ) : null}
        </div>

        {cross ? (
          <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-muted-foreground">
            {t(
              "Converted at {rate}, the rate frozen onto these bills when they were raised — not today's."
            ).replace("{rate}", rate!.toLocaleString())}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="amountShown">
              {t("Amount received")} ({payCurrency === LOCAL ? "TSh" : "USD"})
            </Label>
            <MoneyInput
              id="amountShown"
              name="amountShown"
              value={typedTotal ?? String(allocated || "")}
              onValueChange={(raw) => setTypedTotal(raw)}
            />
            <p className="text-xs text-muted-foreground">
              {typedTotal === null
                ? t("Following what you ticked. Change it if they sent a different amount.")
                : t("Typed by you.")}
            </p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="method">{t("How it was paid")}</Label>
            <NativeSelect id="method" name="method" className="h-11" defaultValue="MOBILE_MONEY">
              <option value="MOBILE_MONEY">{t("Mobile money")}</option>
              <option value="CASH">{t("Cash")}</option>
              <option value="BANK_TRANSFER">{t("Bank transfer")}</option>
              <option value="CHEQUE">{t("Cheque")}</option>
            </NativeSelect>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="reference">{t("Reference")}</Label>
            <Input
              id="reference"
              name="reference"
              className="h-11"
              placeholder={t("M-Pesa code, slip number")}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="accountId">{t("Which account did it land in?")}</Label>
            <NativeSelect id="accountId" name="accountId" className="h-11" defaultValue="">
              <option value="">{t("Not said yet")}</option>
              {accounts
                .filter((a) => a.currency === payCurrency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </NativeSelect>
          </div>

          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">{t("Note")}</Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
        </div>

        {/* Shown only when the two figures differ, because in the ordinary case
            they are the same and a row of matching numbers is just noise. */}
        {Math.abs(left) > 0.005 ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              over
                ? "border-destructive/40 bg-destructive/5"
                : "border-warning/40 bg-warning/5"
            }`}
          >
            {over ? (
              t(
                "You have put more against bills than the customer sent. Untick a bill, or raise the amount received."
              )
            ) : (
              <>
                <span className="font-medium">
                  {money(left)} {t("left over")}
                </span>{" "}
                {t("stays with the customer as credit for next time.")}
              </>
            )}
          </div>
        ) : null}
      </section>

      {/* Nothing ticked is a legitimate answer: the customer has paid for cargo
          that has not landed, so there is no bill to tick. The money is held as
          their credit and settles the invoice by itself at check-in. */}
      <SubmitButton disabled={over || received <= 0} pendingLabel="Recording…">
        {left > 0.005 ? (
          <Wallet className="mr-2 h-4 w-4" />
        ) : (
          <Banknote className="mr-2 h-4 w-4" />
        )}
        {allocations.length === 0
          ? `${t("Record")} ${money(received)} · ${t("held as their credit")}`
          : `${t("Record")} ${money(received)} · ${allocations.length} ${t("cargo")}`}
      </SubmitButton>
    </form>
  );
}
