"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Plus, Search, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import {
  IdempotencyKey,
  useIdempotencyKey,
} from "@/components/app/idempotency-key";
import { PaymentProofField } from "@/components/app/payment-proof-field";
import { TransportSplit } from "@/components/app/transport-split";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { MoneyInput } from "@/components/ui/money-input";
import { ChangeRate } from "@/components/app/change-rate";
import { GiveDiscount } from "@/components/app/give-discount";
import { PaymentDifference } from "@/components/app/payment-difference";
import { WaiveStorage } from "@/components/app/waive-storage";
import { submitPaymentForVerification } from "@/lib/actions/collections";
import {
  billableQueue,
  recordPayment,
  searchBillable,
  type BillableBatch,
  type BillableHit,
} from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";
import type { ExpenseAccount } from "@/components/app/expense-form";

/** A flight filter. Same shape the collections queue uses for its own chips. */
const chip = (on: boolean) =>
  `focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
    on
      ? "border-brand bg-brand text-brand-foreground"
      : "bg-card text-muted-foreground hover:bg-accent"
  }`;

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
  canRecord = true,
  canAdjust = false,
  canDiscount = false,
  canChangeRate = false,
  canWaiveStorage = false,
  compact = false,
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
  /**
   * Whether this reader may say the money ARRIVED.
   *
   * Support gets the identical screen — same search, same fields, same shape —
   * because it is doing the identical job: a customer rang, they paid, write it
   * down. What differs is the destination: this desk files a claim for Finance to
   * verify, exactly as it always has, because it is repeating what a customer
   * said rather than confirming money reached an account.
   *
   * One component, not a copy. Two forms for one act would have meant two places
   * to keep in step about currency, evidence and rates — the duplication this app
   * has been bitten by four times.
   */
  canRecord?: boolean;
  /** ledger.adjust — may decide a difference is never arriving. */
  canAdjust?: boolean;
  /** invoice.discount — may take money off the bill before it is paid. */
  canDiscount?: boolean;
  /** invoice.rate — may re-quote the bill's frozen rate. */
  canChangeRate?: boolean;
  /** invoice.storage.waive — may forgive the storage clock. */
  canWaiveStorage?: boolean;
  /**
   * One word instead of two.
   *
   * The ledger header carries four money doors now — payment, cost, merge,
   * credit — and four full phrases wrapped the row onto a second line above
   * the page's own title. The icon does the naming; the tooltip carries the
   * full words for anybody who wants them.
   */
  compact?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(autoOpen);
  /* Where it landed. The method the ledger stores is read off this account by
     the server — see methodForKind — so nothing here has to guess at one. */
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BillableHit[]>([]);
  const [picked, setPicked] = useState<BillableHit | null>(null);

  /*
    RE-READ THE BILL AFTER A CONTROL CHANGES IT.

    `picked` is a client snapshot taken when the desk chose the bill. The four
    controls beside it — discount, write-off, rate, storage — save on the
    SERVER and revalidate the pages that render a bill from server props; they
    cannot touch state inside this open dialog. So the dialog would sit there
    showing the pre-discount balance, and the money box, which follows that
    balance, would record a payment for a figure the bill no longer asks for.

    The invoice number is unique, so searching it returns this bill and only
    this bill. If the search comes back empty — a bill voided under us — the
    snapshot is left alone rather than blanked, because blanking it mid-form
    loses everything the desk has typed.
  */
  const refreshPicked = () => {
    const current = picked;
    if (!current) return;
    startSearch(async () => {
      const again = await searchBillable(current.invoiceNumber);
      const fresh = again.find((h) => h.invoiceId === current.invoiceId);
      if (fresh) setPicked(fresh);
    });
  };
  /*
    Who has not paid, before anybody types.

    The panel used to open on an empty box, which asks the desk to already know
    the answer. The question in the room is "who on this flight still owes us",
    and that is a list. The search box narrows it now instead of being the only
    way in.
  */
  const [queue, setQueue] = useState<BillableHit[]>([]);
  const [batches, setBatches] = useState<BillableBatch[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  /* The delivery half of what was handed over, and where it is paid from. */
  const [transport, setTransport] = useState("");
  const [transportSourceId, setTransportSourceId] = useState("");
  /* The desk looked at a fare bigger than the cargo and said it was right. */
  const [fareConfirmed, setFareConfirmed] = useState(false);
  /*
    THE OTHER QUESTION THIS LIST IS ASKED.

    The flight chips answer "which aircraft"; this answers "has somebody
    already paid". Two different reasons to open this panel — banking a
    payment that has just come in, and clearing the claims Support sent up —
    and only the first had a way to narrow the list.
  */
  const [onlyClaimed, setOnlyClaimed] = useState(false);
  const [loadingQueue, startQueue] = useTransition();
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
  /*
    NULL MEANS THE TOTAL IS STILL FOLLOWING THE BILL.

    While it is, a fare ADDS to it — the customer owes the bill and hands over
    the delivery on top, so what they actually send is the two together. Once
    the clerk has typed the figure off the customer's message, that figure is
    the truth and the fare stops moving it.

    It was a plain string seeded with the balance, so the ordinary case — leave
    it alone, type the fare — carved the fare OUT of the bill's own figure and
    left the bill short by exactly the fare, silently.
  */
  const [typedCargo, setTypedCargo] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  /* The authority picks the action; the form is the same either way. */
  type Outcome = {
    receiptNumber?: string;
    pickupNoteNumber?: string | null;
    submissionNumber?: string;
  };
  const [state, action] = useActionState<ActionResult<Outcome>, FormData>(
    (canRecord ? recordPayment : submitPaymentForVerification) as unknown as (
      state: ActionResult<Outcome>,
      payload: FormData
    ) => Promise<ActionResult<Outcome>>,
    { ok: true }
  );
  const idem = useIdempotencyKey();

  /*
    Searched as it is typed, after a pause.

    A tracking number is fifteen keystrokes and a customer name is more, so
    firing on every one of them would be a query per letter for a result nobody
    has finished asking for. 250ms is long enough to cover typing and short
    enough that the list feels like it is keeping up.
  */
  useEffect(() => {
    if (!open) return;
    startQueue(async () => {
      const next = await billableQueue(batchId || undefined);
      setQueue(next.hits);
      /* The chips are recomputed across every flight regardless of which one
         is selected, so narrowing to one does not make the others vanish. */
      setBatches(next.batches);
    });
  }, [open, batchId]);

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

  /*
    Searching or browsing — one list either way.

    Two lists rendered by two blocks would be two places for the row to drift,
    and the row is where somebody decides how much a customer owes.
  */
  const searchTerm = query.trim();
  const found = searchTerm.length >= 2 ? hits : queue;
  const shown = onlyClaimed ? found.filter((b) => b.claimed) : found;
  /* Counted off the whole list, not the filtered one, or the chip would
     always read the number it is about to show. */
  const claimedCount = found.filter((b) => b.claimed).length;
  const busy = searchTerm.length >= 2 ? searching : loadingQueue;

  /*
    A CLAIM IS A SUCCESS TOO.

    Both of these tested for a receipt number — which only recordPayment
    returns. Support's door calls submitPaymentForVerification, which returns a
    submission number, so for her NOTHING happened on success: no confirmation,
    the form left full, the idempotency key never retired, and the queue still
    showing the bill she had just sent up. A desk that cannot tell whether it
    worked presses again, and the second press is refused as a repeat of a
    payment they were never told about.
  */
  const done = state.ok ? state.data : undefined;
  const saved = done?.receiptNumber ?? done?.submissionNumber ?? null;

  /* Once it saves, the panel resets rather than leaving a filled form that
     would record the same payment twice if somebody pressed again. */
  useEffect(() => {
    if (saved) {
      /* The next payment is a different payment and must not be refused as a
         repeat of the one that just saved. */
      idem.reset();
      setPicked(null);
      setQuery("");
      setHits([]);
      /* Re-read the queue: the bill just settled has to leave the list, or the
         next person down it is invited to take the same money twice. */
      startQueue(async () => {
        const next = await billableQueue(batchId || undefined);
        setQueue(next.hits);
        setBatches(next.batches);
      });
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
  /* Everything about the last payment goes, not just the bill. The fare and
     the till it came from used to survive a pick, so the next customer's box
     opened inflated by the previous customer's delivery. */
  const clearMoney = () => {
    setTypedCargo(null);
    setTransport("");
    setTransportSourceId("");
    setFareConfirmed(false);
  };

  const pick = (hit: BillableHit) => {
    setPicked(hit);
    setTendered("TZS");
    clearMoney();
  };

  /* A fare is typed in whatever money was selected at the time and cannot be
     re-expressed without inventing a rate for it, so switching asks again —
     otherwise a TZS 10,000 fare silently became a USD 10,000 one. */
  const switchCurrency = (currency: string) => {
    setTendered(currency);
    clearMoney();
  };

  const close = () => {
    setOpen(false);
    setPicked(null);
    setQuery("");
    setHits([]);
    clearMoney();
  };

  /*
    THE BILL, THE FARE, THE TOTAL — DERIVED, NOT SEEDED.

    Recomputed every render so the figure cannot go stale under a bill that
    changed, and so the fare is added on top rather than carved out of the
    bill's own number. Rounded rather than concatenated: adding a fare to a
    dollar balance gives floats like 8.399999999999999.
  */
  const billInTender = picked ? owedIn(picked, tendered) : null;
  const fare = Math.max(0, Number(transport) || 0);
  /*
    THE BOX IS THE CARGO MONEY. THE FARE IS ADDED TO IT.

    A box labelled "Total received" beside one labelled "Transport they added"
    reads as the fare going on top of a figure that already contains it. Worse
    on this screen than anywhere: the breakdown card below prints the words
    "Total received" against the same number, so one page carried that label
    twice with an addition sign between them.
  */
  const followedCargo =
    billInTender === null
      ? ""
      : tendered === "TZS"
        ? String(Math.round(billInTender))
        : String(Math.round(billInTender * 100) / 100);
  const cargoShown = typedCargo ?? followedCargo;
  const cargoHalf = Math.max(0, Number(cargoShown) || 0);
  /* Rounded here: a dollar cargo plus a dollar fare makes floats like
     8.399999999999999, and this box takes anything a clerk can paste. */
  const totalShown =
    tendered === "TZS"
      ? String(Math.round(cargoHalf + fare))
      : String(Math.round((cargoHalf + fare) * 100) / 100);
  const total = Number(totalShown);
  const tolerance = tendered === "TZS" ? 0.5 : 0.005;
  const short =
    billInTender !== null && cargoHalf > 0 && billInTender - cargoHalf > tolerance;
  /* The other side of the same sentence. Said out loud rather than left for
     the clerk to notice, because an overpayment looks exactly like a typo
     until something on the screen says it is fine. */
  const overpaid =
    billInTender !== null && cargoHalf > 0 && cargoHalf - billInTender > tolerance;
  /* Almost always an extra nought. The server refuses it without the tick. */
  const fareOverCargo = fare > 0 && cargoHalf > 0 && fare > cargoHalf + 0.001;
  /* The habit this change invites — see the same guard on the cargo panel. */
  const looksLikeTheWholeTransfer =
    typedCargo !== null &&
    fare > 0 &&
    billInTender !== null &&
    Math.abs(cargoHalf - (billInTender + fare)) < (tendered === "TZS" ? 1 : 0.01);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-lg"
        title={t("Record Payment")}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {compact ? t("Payment") : t("Record Payment")}
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
          {t("Record Payment")}
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

      {saved ? (
        <p className="border-b border-success/20 px-5 py-2.5 text-sm text-success">
          <Check className="mr-1.5 inline h-4 w-4" />
          {done?.receiptNumber
            ? `${t("Recorded")} · ${done.receiptNumber}`
            : `${t("Sent to Finance")} · ${saved}`}
          {done?.pickupNoteNumber
            ? ` · ${t("pickup note")} ${done.pickupNoteNumber}`
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

          {/* The flights money is still owed on, heaviest first. The desk
              works one arrival at a time — a plane lands and its customers are
              rung through in a sitting — so the list opens grouped the way the
              money actually comes in. */}
          {/* Shown while browsing rather than searching. Either axis is enough
              to be worth a row: a flight to narrow to, or claims to clear. */}
          {searchTerm.length < 2 && (batches.length > 0 || claimedCount > 0) ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setBatchId("")}
                className={chip(batchId === "")}
              >
                {t("Everyone who owes")}
              </button>
              {/* Yellow, and only when there is something in it — the same
                  colour a claim wears on every other screen. */}
              {claimedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setOnlyClaimed((v) => !v)}
                  className={
                    onlyClaimed
                      ? "focus-ring rounded-full border border-warning bg-warning px-2.5 py-1 text-xs font-semibold text-warning-foreground"
                      : "focus-ring rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning hover:bg-warning/20"
                  }
                >
                  {t("Payment to verify")}
                  <span className="ml-1.5 opacity-50">·</span>
                  <span className="ml-1 opacity-80">{claimedCount}</span>
                </button>
              ) : null}
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBatchId(b.id)}
                  className={chip(batchId === b.id)}
                >
                  {b.flightNumber ?? b.batchNumber}
                  {/* Separated, not just spaced. "ET999" beside a bare "1"
                      reads as flight ET9991, which is a real flight number
                      shaped exactly like a wrong answer. */}
                  <span className="ml-1.5 opacity-50">·</span>
                  <span className="ml-1 opacity-70">{b.bills}</span>
                </button>
              ))}
            </div>
          ) : null}

          <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
            {busy && shown.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {t("Looking…")}
              </li>
            ) : shown.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {searchTerm.length >= 2
                  ? t("Nothing matches that. Try the tracking number.")
                  : t("Nobody owes anything on this one.")}
              </li>
            ) : (
              shown.map((hit) => {
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
                      className="group flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <span className="font-mono text-xs font-semibold">
                        {hit.trackingNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {hit.customerName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {hit.goods}
                        </span>
                        {/* Which flight it came in on. Only while the list is
                            unfiltered — under a chip it is the same answer on
                            every row. */}
                        {!batchId && hit.flightNumber ? (
                          <span className="ml-2 text-[11px] text-muted-foreground/70">
                            {hit.flightNumber}
                          </span>
                        ) : null}
                      </span>
                      {settled ? (
                        <span className="text-xs text-success">
                          {t("settled")}
                        </span>
                      ) : (
                        <>
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
                          {/*
                            ONE CLICK FROM TAKING THE MONEY AGAIN.

                            This picker is the last place a duplicate can be
                            started. recordPayment refuses it, but only once
                            the form has been filled in — and by then the
                            customer at the counter has usually been asked to
                            pay a second time. Yellow, like everywhere else a
                            payment is waiting to be verified.
                          */}
                          {hit.claimed ? (
                            <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                              {t("Payment to verify")}
                            </span>
                          ) : (
                            /* Said out loud rather than left to be guessed
                               from the fact that a row happens to be
                               clickable. */
                            <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors group-hover:border-success/40 group-hover:text-success sm:inline">
                              {canRecord ? t("Record payment") : t("Record it")}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        <form action={action} className="px-5 py-4">
          <IdempotencyKey value={idem.key} />
          <input type="hidden" name="invoiceId" value={picked.invoiceId} />
          {/* What actually reached the account — the cargo and the fare added.
              The visible box carries no name on purpose; see it above. */}
          <input type="hidden" name="amount" value={totalShown} />

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
                {t("Cargo charge")}
              </span>
              {/* Emptying it hands the figure back to the bill rather than
                  latching an empty string. */}
              {/* NO name: this box is what the clerk reads, not what is
                  submitted. The whole transfer goes in the hidden field
                  beside invoiceId, and a nameless input still honours
                  `required`. */}
              <Input
                inputMode="decimal"
                required
                value={cargoShown}
                onChange={(e) =>
                  setTypedCargo(e.target.value === "" ? null : e.target.value)
                }
                className="w-36 bg-card tabular-nums"
              />
            </label>

            {/*
              THE DELIVERY, INSIDE THE SAME TRANSFER.

              Beside the figure it comes out of: the customer sent one amount
              and this is how much of it was the delivery.

              THE CUSTOMER MAY PAY INTO ANYTHING — bank included, because that
              is their choice and the money is recorded where it landed.
              Paying the driver is the company's own business and happens out
              of the till or off the Lipa number, so this list is those two.
              The server refuses a bank here as well.
            */}
            <label className="flex flex-col gap-1">
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {t("Transport they added")}
              </span>
              <MoneyInput
                name="transport"
                value={transport}
                onValueChange={(raw) => {
                    setTransport(raw);
                    /* A tick confirms ONE figure. Left standing, a clerk who
                       confirmed 100,000 and then slipped another nought onto
                       it would send 1,000,000 through already confirmed. */
                    setFareConfirmed(false);
                  }}
                decimals={tendered === "TZS" ? 0 : 2}
                placeholder="0"
                className="w-28 bg-card"
              />
            </label>
            {/* Always here, greyed until there is transport to settle — a
                disabled field is not submitted. It used to appear only once a
                figure was typed, so nobody knew it existed. */}
            <label className="flex flex-col gap-1">
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {t("Transport settled from")}
                </span>
                <NativeSelect
                  name="transportSourceId"
                  required={Number(transport) > 0}
                  disabled={!(Number(transport) > 0)}
                  value={transportSourceId}
                  onChange={(event) => setTransportSourceId(event.target.value)}
                  className="w-52 bg-card disabled:opacity-50"
                >
                  <option value="" disabled>
                    {t("Cash or the Lipa number")}
                  </option>
                  {accounts
                    .filter(
                      (a) =>
                        a.currency === tendered &&
                        (a.kind === "CASH" || a.kind === "MOBILE_MONEY")
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
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

            {/* Never asked. The account this landed in says how it arrived:
                the tin is cash, a till is mobile money, a bank is a transfer.
                Two questions with one answer is two answers that can disagree,
                and a movement whose method and account contradict each other
                cannot be reconciled against a statement. */}

            {/*
              Asked of every desk, and no longer skippable.

              This used to be Finance's field alone, on the reasoning that
              Support cannot know which of our accounts the money reached and
              a guess is worse than silence. The owner's rule replaces it:
              nothing is recorded anywhere without saying where it landed, and
              the customer's own proof names the destination — the Lipa number
              on the M-Pesa message, the account on the bank slip. What Support
              picks is a claim like the figure beside it; Finance still names
              the account for real when they verify, and can correct this one.
            */}
            <label className="flex flex-col gap-1">
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {canRecord ? t("Into which account") : t("Where did it land")}
              </span>
              <NativeSelect
                name="accountId"
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="w-52 bg-card"
              >
                <option value="" disabled>
                  {t("Choose the account")}
                </option>
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
            {/* Named for what it is and why, not shrugged off as "(optional)",
                and carrying the same amber every other proof field carries. */}
            <PaymentProofField compact />

            {/*
              THE SAME POWER, WHICHEVER DOOR THE DESK CAME THROUGH.

              This dialog offered a money box and nothing else, while the panel
              on the cargo page offered a discount, a write-off, the rate and
              the storage waiver — the same person, the same bill, the same
              permissions, two different amounts of power depending on which
              button they happened to press. A desk that opened this one and
              found the customer disputing a figure had to abandon what they
              had typed and go looking for the other screen.

              Each is gated on the reader's OWN permission, so Support sees only
              what Support may do and nothing is offered that the action would
              refuse afterwards. All four portal themselves out of this form —
              a form inside a form is dropped by the browser — which is why
              they can sit here at all.
            */}
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {canDiscount ? (
                <GiveDiscount
                  invoiceId={picked.invoiceId}
                  currency={picked.currency}
                  current={picked.discount}
                  rate={billRate}
                  onSaved={refreshPicked}
                />
              ) : null}
              {/*
                NO STANDALONE WRITE-OFF HERE, DELIBERATELY.

                This dialog exists to record money. When the typed figure is
                short of the bill the notice below offers to clear the rest in
                the same step, and when it is over the notice says the bill is
                settled — between them they answer the whole question, in the
                place the desk is already looking.

                A second control that writes the balance off on its own only
                fires correctly when NO money is arriving, which is not what
                anybody opened this dialog to do. Offered here it produced a
                warning telling the desk to go and use the box above instead.
                It lives on the cargo page, where a bill can be closed without
                a payment.
              */}
              {canChangeRate && picked.currency !== "TZS" ? (
                <ChangeRate
                  invoiceId={picked.invoiceId}
                  currency={picked.currency}
                  current={billRate}
                  total={picked.total}
                  onSaved={refreshPicked}
                />
              ) : null}
              {canWaiveStorage && picked.storage > 0.005 ? (
                <WaiveStorage
                  invoiceId={picked.invoiceId}
                  currency={picked.currency}
                  storage={picked.storage}
                  rate={billRate}
                  onSaved={refreshPicked}
                />
              ) : null}
            </div>

            {/* The same three lines every other money screen shows. */}
            <div className="w-full">
              <TransportSplit
                cargo={cargoHalf}
                transport={fare}
                total={total}
                money={(v) => `${tendered} ${v.toLocaleString()}`}
              />
            </div>

            {(short || overpaid) && billInTender !== null ? (
              <PaymentDifference
                gap={billInTender - cargoHalf}
                paid={cargoHalf}
                tendered={tendered}
                billCurrency={picked.currency}
                gapInBill={
                  tendered === picked.currency || !billRate
                    ? billInTender - cargoHalf
                    : (billInTender - cargoHalf) /
                      (tendered === "TZS" ? billRate : 1 / billRate)
                }
                /* Support presses the same button. Their copy submits a claim
                   rather than recording money, so the tick travels with it and
                   Finance confirms it on the verify screen. */
                canClear={canRecord ? Boolean(canAdjust) : true}
                submitting={!canRecord}
              />
            ) : null}

            {fareOverCargo ? (
              <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px]">
                <input
                  type="checkbox"
                  name="transportConfirmed"
                  value="1"
                  checked={fareConfirmed}
                  onChange={(event) => setFareConfirmed(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                  <span className="font-semibold">
                    {t("The transport is more than the cargo.")}
                  </span>{" "}
                  {t("Check the figure. Tick this if it is right.")}
                </span>
              </label>
            ) : null}

            <SubmitButton
              variant="brand"
              pendingLabel={canRecord ? t("Recording…") : t("Sending…")}
            >
              {canRecord ? t("Record it") : t("Send to Finance")}
            </SubmitButton>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {canRecord
              ? t(
                  "It settles this bill, lands in that account and issues a receipt. A bill paid in full releases its cargo."
                )
              : t(
                  "Finance checks it before anything is settled. Nothing moves on this screen and no cargo is released until they agree."
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
