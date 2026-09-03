"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Banknote,
  Download,
  FileText,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitCombinedPayment } from "@/lib/actions/collections";
import { recordCustomerPayment } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

export type OpenBill = {
  invoiceId: string;
  invoiceNumber: string;
  trackingNumber: string;
  description: string;
  /** The flight it came on. Null while it is still waiting for one. */
  batchNumber: string | null;
  currency: string;
  outstanding: number;
  /** The rate frozen onto this bill — what a payment in another currency
      converts at. Null on bills raised before rates were stored. */
  exchangeRate: number | null;
};

const LOCAL = "TZS";

/** One place, so the label and the stored value cannot drift apart. */
const METHOD_LABELS: Record<string, string> = {
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CHEQUE: "Cheque",
};

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
  canRecord,
  customerId,
  customerName,
  bills,
  accounts,
}: {
  /**
   * Whether this desk may say money ARRIVED, or only that a customer says so.
   *
   * Finance records; Support claims. The screen is the same because the act is
   * the same — tick the customer's bills, say what came in — and the business
   * rule is untouched: a claim reaches no account until Finance verifies it,
   * and verification hands the whole thing to the very action Finance would
   * have run by hand.
   */
  canRecord: boolean;
  customerId: string;
  customerName: string;
  bills: OpenBill[];
  accounts: { id: string; name: string; currency: string; kind: string }[];
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ receiptNumber?: string; settled?: number; submissionNumber?: string }>,
    FormData
  >(
    (canRecord ? recordCustomerPayment : submitCombinedPayment) as never,
    { ok: true }
  );

  /*
    TWO CURRENCIES, AND THEY ARE DIFFERENT QUESTIONS.

    `billCurrency` is which bills are being settled — the customer's dollar
    bills or, rarely, their shilling ones. `payCurrency` is what they actually
    handed over, which for this business is nearly always shillings against a
    dollar bill. Conflating the two is what made the screen refuse the most
    common payment it will ever be asked to take.
  */
  const [billCurrency, setBillCurrency] = useState(bills[0]?.currency ?? LOCAL);
  /*
    SHILLINGS FIRST, ALWAYS.

    Freight is priced in dollars because that is how it is bought, and every
    bill is written in them. Nobody in Dar es Salaam thinks in dollars: the
    till holds shillings, the customer sends shillings, and a clerk shown USD
    2,280 has to convert in their head, at whatever rate they remember, before
    they can check the transfer in front of them against it.

    So the screen opens in shillings wherever it honestly can — which is
    wherever the bills agree on one frozen rate — and the dollar figure the
    bill is denominated in stays beside it. Switching back to dollars is one
    press, for the customer who really did send dollars.
  */
  const [payCurrency, setPayCurrency] = useState(() => {
    const first = bills[0]?.currency ?? LOCAL;
    const group = bills.filter((b) => b.currency === first);
    /* Every bill needs a rate of its own, not one rate between them: two bills
       quoted a fortnight apart carry two, and both are right. Same test as
       canCross below, so the screen never opens on a currency it will not
       then offer. */
    const quotable =
      group.length > 0 &&
      group.every((b) => b.exchangeRate !== null && b.exchangeRate > 0);
    return quotable ? LOCAL : first;
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /* Only ever consulted in split mode. A share typed, then abandoned by
     unticking the bill, must not travel with the form. */
  const [shares, setShares] = useState<Record<string, string>>({});
  const [split, setSplit] = useState(false);
  /*
    THE ACCOUNT IS THE METHOD.

    "How it was paid" and "Which account did it land in?" were two questions
    with one answer: money in Vodacom M-Pesa arrived by mobile money, money in
    CRDB arrived by transfer, money in the office tin was cash. Asking twice
    invites them to disagree, and a payment whose method and account contradict
    each other is one nobody can reconcile against a statement.

    So the account is picked and the method follows it. The method is asked for
    only when nobody has said where the money landed yet — the one case where
    it cannot be derived.
  */
  const [accountId, setAccountId] = useState("");
  /** Null while the total is following the selection, which is nearly always. */
  const [typedTotal, setTypedTotal] = useState<string | null>(null);

  const payable = useMemo(
    () => bills.filter((b) => b.currency === billCurrency),
    [bills, billCurrency]
  );

  /*
    EVERY BILL AT ITS OWN RATE.

    This once demanded that all the bills in one payment share a single frozen
    rate, and refused when they did not. But two consignments quoted a fortnight
    apart carry the two rates that were published on those days — which is not a
    problem, it is the system working — and refusing meant the customer standing
    at the counter with one transfer for both had to be turned into two
    payments. The thing this screen exists to stop.

    So each bill converts at the rate frozen onto IT, the figure that customer
    was quoted for that consignment, and the total is the sum. Shillings are
    offered as soon as every bill on the page carries a rate; one that carries
    none has no honest shilling figure and keeps the whole page in dollars,
    because a total mixing converted and unconverted lines is a total of
    nothing.
  */
  const canCross = useMemo(
    () =>
      payable.length > 0 &&
      payable.every((b) => b.exchangeRate !== null && b.exchangeRate > 0),
    [payable]
  );
  const cross = payCurrency !== billCurrency;

  /** The one rate, when there is one — for the line that quotes it. */
  const oneRate = useMemo(() => {
    const rates = new Set(payable.map((b) => b.exchangeRate));
    return rates.size === 1 ? [...rates][0] : null;
  }, [payable]);

  /** A bill's figure, restated in what the customer is handing over. */
  const inPay = (bill: OpenBill) => {
    const rate = bill.exchangeRate;
    if (!cross || !rate) return bill.outstanding;
    const converted =
      payCurrency === LOCAL ? bill.outstanding * rate : bill.outstanding / rate;
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
        ? Number(shares[b.invoiceId] ?? inPay(b)) || 0
        : inPay(b),
    }))
    .filter((a) => a.amount > 0);

  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  /* The figure the customer actually sent. It follows what was ticked until
     somebody says otherwise, because in the ordinary case they are the same
     number and asking for it twice is how a 330,000 becomes a 33,000. */
  const received = typedTotal === null ? allocated : Number(typedTotal) || 0;
  const left = received - allocated;
  const over = left < -0.005;

  const chosen = accounts.find((a) => a.id === accountId) ?? null;
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
    const claimed = state.data.submissionNumber;
    return (
      <div className="panel space-y-4 border-success/40 p-5">
        <div>
          <p className="font-display text-lg font-bold text-success">
            {claimed
              ? `${t("Sent to Finance")} — ${claimed}`
              : `${t("Payment recorded")} — ${state.data.receiptNumber}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {claimed
              ? t(
                  "Finance will check it against the account. Nothing has been settled yet — the cargo stays held until they confirm the money arrived."
                )
              : `${state.data.settled} ${t("bill(s) settled in full.")} ${t(
                  "The account moved once, for the money that actually arrived."
                )}`}
          </p>
        </div>

        {/*
          ONE RECEIPT, NAMING EVERY CONSIGNMENT IT ANSWERED.

          The customer's question after paying for four consignments is "is all
          of it paid for", and four separate receipts cannot answer it — they
          describe four payments, which is the thing this screen exists to stop.
          Offered here rather than found later, because this is the moment the
          customer is still on the phone.
        */}
        <div className="flex flex-wrap gap-2">
          {claimed ? null : (
          <a
            href={`/app/finance/receipts/${state.data.receiptNumber}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-brand/40 px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10"
          >
            <Download className="h-4 w-4" />
            {t("Download the receipt")}
          </a>
          )}
          <a
            href="/app/finance/payments/new"
            className="focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent/40"
          >
            {t("Another customer")}
          </a>
        </div>
      </div>
    );
  }

  return (
    /*
      TWO COLUMNS ON A DESK, ONE ON A PHONE.

      The cargo list and the payment details were stacked down the middle of a
      1,900px screen with six hundred pixels of nothing either side, so the
      clerk ticked bills at the top, scrolled past empty space, and typed the
      amount out of sight of what they had ticked. Side by side, the figure
      being typed and the figure it should match are in view at once.
    */
    <form
      action={action}
      className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="currency" value={payCurrency} />
      <input type="hidden" name="amount" value={received || ""} />
      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(allocations)}
      />

      {/* LEFT: the job. Which cargo is this customer paying for. */}
      <div className="space-y-5">
        <FormError state={state} />

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
                  const next = e.target.value;
                  setBillCurrency(next);
                  /* Shillings again, if that set of bills can be read in them.
                     Same reason as the initial state above. */
                  const group = bills.filter((b) => b.currency === next);
                  const quotable =
                    group.length > 0 &&
                    group.every((b) => b.exchangeRate !== null && b.exchangeRate > 0);
                  setPayCurrency(quotable ? LOCAL : next);
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
                        {/* The flight it came on. Consignments a customer pays
                            for together arrive on different aircraft weeks
                            apart, and the desk is asked which is which. */}
                        {bill.batchNumber ? ` · ${bill.batchNumber}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-sm font-bold tabular-nums">
                        {money(inPay(bill))}
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
                          value={shares[bill.invoiceId] ?? String(inPay(bill))}
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
            {/* What the bills themselves say, beside the figure being handed
                over. The clerk checks a shilling transfer; the bill, the
                receipt and the pickup note are all in dollars. */}
            {cross ? (
              <p className="font-mono text-xs text-muted-foreground">
                {money(
                  /* Back through each bill's OWN rate, so this total is what
                     the bills say rather than what one average rate would make
                     them say. */
                  allocations.reduce((sum, allocation) => {
                    const bill = payable.find(
                      (b) => b.invoiceId === allocation.invoiceId
                    );
                    const billRate = bill?.exchangeRate ?? null;
                    if (!billRate) return sum + allocation.amount;
                    return (
                      sum +
                      (payCurrency === LOCAL
                        ? allocation.amount / billRate
                        : allocation.amount * billRate)
                    );
                  }, 0),
                  billCurrency
                )}
              </p>
            ) : null}
          </div>
          {/*
            The exception, and it needs to look clickable rather than merely
            look like one — plain muted text here read as a caption, not a
            control, and a desk cannot change what it cannot see is a button.
            A bordered pill with its own background says "press me" the way
            unadorned text next to a total never did.
          */}
          <button
            type="button"
            onClick={() => setSplit((v) => !v)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              split
                ? "border-brand/40 bg-brand/10 text-brand"
                : "bg-card text-foreground hover:border-brand/40 hover:bg-accent"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {split ? t("Pay them in full") : t("They are paying part of a bill")}
          </button>
        </footer>

        {/*
          THE BILL FOR ALL OF IT, TO SEND BEFORE THEY PAY.

          Four consignments means four invoices, and sending four asks four
          questions when the customer has one: how much do I transfer? This is
          the covering statement that answers it — every open bill, each at its
          own frozen rate, one total. Nothing is merged: each consignment keeps
          its own invoice, its own batch and its own pickup note.
        */}
        {bills.length > 1 ? (
          <div className="border-t px-5 py-3">
            <a
              href={`/app/finance/customers/${customerId}/bill/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-2 text-xs font-medium text-brand hover:underline"
            >
              <FileText className="h-3.5 w-3.5" />
              {t("Download the combined bill for all {n} consignments").replace(
                "{n}",
                String(bills.length)
              )}
            </a>
          </div>
        ) : null}
      </section>
      </div>

      {/* RIGHT: the money. Pre-filled from what was ticked, and beside it —
          the amount and the total it should match are read together. Sticky on
          a tall screen so a long cargo list does not scroll the button away. */}
      <div className="space-y-5 xl:sticky xl:top-4">
      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-semibold">
            {canRecord
              ? `${t("What arrived from")} ${customerName}`
              : `${t("What {name} says they sent").replace("{name}", customerName)}`}
          </h2>

          {/*
            The bills are in dollars and the money is in shillings, which is the
            ordinary case here, not the exception. Offered only when the bills
            agree on one rate — the server refuses the rest, and a screen that
            offers what the server refuses is worse than one that does not.
          */}
          {canCross ? (
            <div className="inline-flex rounded-full border p-0.5">
              {/* Shillings on the left, because that is the one that is
                  nearly always right and the eye lands there first. */}
              {[LOCAL, "USD"].map(
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
            {oneRate
              ? t(
                  "Converted at {rate}, the rate frozen onto these bills when they were raised — not today's."
                ).replace("{rate}", oneRate.toLocaleString())
              : t(
                  "Each bill converted at the rate frozen onto it when it was raised — not today's."
                )}
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


          {/*
            Asked of both desks, and no longer optional.

            It used to be Finance's field alone and skippable at that. The
            owner's rule replaces both halves: nothing is recorded anywhere
            without saying where the money is, and Support can answer it
            because the customer's proof names the destination. What Support
            picks is a claim — Finance still names the account for real when
            they verify, and can correct this one on the way through.
          */}
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="accountId">{t("Where did it land?")}</Label>
            <NativeSelect
              id="accountId"
              name="accountId"
              required
              className="h-11"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="" disabled>
                {t("Choose the account")}
              </option>
              {accounts
                .filter((a) => a.currency === payCurrency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </NativeSelect>
          </div>

          {/*
            NEVER ASKED, ALWAYS DERIVED.

            "How it was paid" and "which account did it land in" were two
            questions with one answer — money in M-Pesa arrived by mobile money,
            money in CRDB by transfer, money in the tin as cash — and asking
            twice invites them to disagree, which is a payment nobody can
            reconcile against a statement.

            Where no account has been named yet: Support is claiming what a
            customer told them and does not know where it landed, and mobile
            money is what that is here nine times in ten. It is not the last
            word either way — Finance names the account when it verifies, and
            the method is taken from that account, so what is stored is what
            the bank actually shows.
          */}

          {/*
            THE PROOF, IF THERE IS ANY.

            Optional and always was: cash across the counter has no screenshot,
            and refusing the payment does not produce one — it produces a
            payment nobody records. But an M-Pesa confirmation attached now is
            the difference between a verified figure and somebody's word in six
            weeks, so it is asked for where the money is.
          */}
          {/*
            THE EVIDENCE, UNDERNEATH THE MONEY.

            Both optional, and both about the same thing: how this payment will
            be recognised again in six weeks. The reference is what the customer
            quotes; the file is what they sent. Neither blocks a payment — cash
            across a counter has no screenshot and no code, and refusing the
            payment does not produce one, it produces a payment nobody records.
          */}
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="reference">
              {t("Reference")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(optional)")}
              </span>
            </Label>
            <Input
              id="reference"
              name="reference"
              className="h-11"
              placeholder={t("M-Pesa code, slip number")}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="proof">{t("Payment proof — the slip or the screenshot")}</Label>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Not compulsory, but it is what settles an argument months from now. Without it Finance is agreeing to this on somebody's word."
              )}
            </p>
            <input
              id="proof"
              name="proof"
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="focus-ring block w-full rounded-lg border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <p className="text-xs text-muted-foreground">
              {t("The M-Pesa message, a bank slip, a photo of the receipt.")}
            </p>
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
      <SubmitButton
        className="w-full"
        disabled={
          over || received <= 0 || (!canRecord && allocations.length === 0)
        }
        pendingLabel="Recording…"
      >
        {left > 0.005 ? (
          <Wallet className="mr-2 h-4 w-4" />
        ) : (
          <Banknote className="mr-2 h-4 w-4" />
        )}
        {!canRecord
          ? `${t("Send to Finance")} · ${money(received)} · ${allocations.length} ${t("cargo")}`
          : allocations.length === 0
            ? `${t("Record")} ${money(received)} · ${t("held as their credit")}`
            : `${t("Record")} ${money(received)} · ${allocations.length} ${t("cargo")}`}
      </SubmitButton>
      </div>
    </form>
  );
}
