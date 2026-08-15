"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Lock, LockOpen, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  closeBatch,
  reopenBatch,
  returnCarriedCargo,
} from "@/lib/actions/batches";
import { formatLocal, formatUsd } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/types";

export type UnpaidPiece = {
  invoiceId: string;
  trackingNumber: string;
  customerName: string;
  owedUsd: number;
};

/** A live flight this cargo could be moved onto. */
export type CarryTarget = { id: string; batchNumber: string };

export type BatchCloseState = {
  batchId: string;
  batchNumber: string;
  closedAt: string | null;
  closedBy: string | null;
  closeKind: string | null;
  closeNote: string | null;
  /** VERIFIED is the only status the books can be shut from. */
  verified: boolean;
  unpaid: UnpaidPiece[];
  drafts: number;
  unbilled: number;
  /** USD → TZS, or null when no rate is published. */
  rate: number | null;
  /** Open flights this cargo could move onto, newest first. */
  carryTargets: CarryTarget[];
  /** Cargo on THIS batch that arrived from a flight that closed. */
  carriedIn: {
    shipmentId: string;
    trackingNumber: string;
    fromBatchNumber: string;
  }[];
  /** Everything that landed on this flight, so the panel can show the sum. */
  kg: number;
  /** Weight whose bill is settled, and weight nobody has paid for yet. */
  soldKg: number;
  /** What the flight was billed at — the yardstick a payback is judged against. */
  worthUsd: number;
  /** Where the statement has got to, once there is one. */
  statementStatus: string | null;
  reviewNote: string | null;
  /**
   * Everything the flight is, gathered before it is shut.
   *
   * The owner's rule: before it is closed, prepare a complete summary of
   * everything that happened inside that batch. Closing is irreversible
   * without an admin, so the figures somebody is about to sign have to be in
   * front of them at the moment they decide — not one screen back.
   */
  summary: {
    pieces: number;
    packages: number;
    customers: number;
    kg: number;
    expectedUsd: number;
    collectedUsd: number;
    outstandingUsd: number;
    expensesUsd: number;
    expenseByCategory: { label: string; usd: number }[];
    profitUsd: number;
    /** What a kilo actually earned on this flight: billed ÷ weight. */
    sellRate: number | null;
    /** USD → TZS on the day, so the reader knows what the shillings are at. */
    rateUsed: number | null;
    /** What is left behind: cargo nobody has paid for, and who owes it. */
    unpaidPieces: number;
    unpaidKg: number;
    unpaidCustomers: number;
    /** Weight whose bill is settled in full. */
    soldKg: number;
  };
};

const KIND_LABEL: Record<string, string> = {
  SETTLED: "everything was paid",
  DEBT_KEPT: "money still owed, still being chased",
  WRITTEN_OFF: "the rest was written off",
  MIXED: "some written off, some carried on, some still being chased",
  CARRIED_OVER: "the unpaid cargo moved to another batch",
};

/** What can happen to a piece nobody has paid for. */
const CHOICES = [
  { key: "chase", label: "Keep chasing here" },
  { key: "carry", label: "Carry to another batch" },
  { key: "writeOff", label: "Write it off" },
] as const;
type Choice = (typeof CHOICES)[number]["key"];

/**
 * The line under a flight.
 *
 * The owner's problem: a batch that never closes collects income and costs
 * forever, and after a year of a weekly schedule nothing on the board reads as
 * finished. Almost every flight now closes itself the moment its last bill is
 * settled — this panel is for the ones that will not, and for saying so when
 * one already has.
 *
 * The decision it asks for is per consignment, because a real flight has both
 * kinds of debt at once: one worth another phone call, and three small ones
 * that are gone. Nothing is ticked by default. Silence has to mean "still
 * chasing", never "write it off".
 */
export function BatchClosePanel({ state }: { state: BatchCloseState }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [reopening, setReopening] = useState(false);
  /* One decision per piece, defaulting to the one that gives nothing away. */
  const [decisions, setDecisions] = useState<Record<string, Choice>>({});
  const [carryTo, setCarryTo] = useState<string>("");
  /*
    Closing is one click away from irreversible, so it is two.

    The owner's rule: it should not just close, it should ask, and it should
    show everything first — including what happens to each piece somebody has
    just decided about. This flag flips the form from deciding to reading. The
    decisions stay in the DOM the whole time, hidden rather than unmounted, so
    what gets posted is exactly what was reviewed.
  */
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const decisionFor = (id: string): Choice => decisions[id] ?? "chase";

  const [closeState, close] = useActionState<
    ActionResult<{
      kind: string;
      writtenOff: number;
      kept: number;
      carried: number;
    }>,
    FormData
  >(closeBatch, { ok: true });
  const [returnState, sendBack] = useActionState<
    ActionResult<Record<string, never>>,
    FormData
  >(returnCarriedCargo, { ok: true });
  const [reopenState, reopen] = useActionState<
    ActionResult<Record<string, never>>,
    FormData
  >(reopenBatch, { ok: true });

  const money = (usd: number) =>
    state.rate === null ? formatUsd(usd) : formatLocal(usd * state.rate);

  const owedUsd = state.unpaid.reduce((sum, row) => sum + row.owedUsd, 0);
  const totalFor = (choice: Choice) =>
    state.unpaid
      .filter((row) => decisionFor(row.invoiceId) === choice)
      .reduce((sum, row) => sum + row.owedUsd, 0);
  const countFor = (choice: Choice) =>
    state.unpaid.filter((row) => decisionFor(row.invoiceId) === choice).length;

  const carrying = countFor("carry");
  const writingOff = countFor("writeOff");

  /*
    Cargo that did not fly in with this flight.

    Said on the batch that RECEIVED it, because that is the batch whose weight,
    piece count and revenue would otherwise quietly include a consignment it
    never carried. Rendered above whatever the close state is, since it is true
    either way.
  */
  const carriedInNote =
    state.carriedIn.length > 0 ? (
      <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-info/25 bg-info/[0.04] px-5 py-3 text-xs text-muted-foreground">
        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-info" />
        <span className="font-medium text-foreground">
          {state.carriedIn.length}{" "}
          {t(
            state.carriedIn.length === 1
              ? "piece was carried onto this batch"
              : "pieces were carried onto this batch"
          )}
        </span>
        <span>
          {t("from")}{" "}
          {[...new Set(state.carriedIn.map((row) => row.fromBatchNumber))].join(", ")}
          {t(
            ", still unpaid when those books were shut. They did not fly with this one."
          )}
        </span>
        {/*
          A way back.

          Carrying cargo forward is decided under pressure at a close, and the
          boss declining the statement is exactly the case where it has to be
          undone. Each piece can go home to the flight it came from — refused
          while that flight is shut, because putting unpaid cargo back onto
          closed books would make a statement he has already read wrong.
        */}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {state.carriedIn.map((row) => (
            <form key={row.shipmentId} action={sendBack}>
              <input type="hidden" name="shipmentId" value={row.shipmentId} />
              <SubmitButton
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs text-brand hover:bg-brand/10 hover:text-brand"
                pendingLabel={t("Sending…")}
              >
                <Undo2 className="h-3 w-3" />
                {t("Send")} {row.trackingNumber} {t("back")}
              </SubmitButton>
            </form>
          ))}
        </span>
      </p>
    ) : null;

  const carriedInError = <FormError state={returnState} />;

  /* ------------------------------------------------------------------ */
  /* Already closed: one line, and a way back.                           */
  /* ------------------------------------------------------------------ */
  if (state.closedAt) {
    return (
      <>
      {carriedInNote}
    {carriedInError}
      {carriedInError}
      <section className="mb-6 overflow-hidden rounded-xl border border-success/25 bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-success/[0.04] px-5 py-3 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-success" />
          <span className="font-medium">
            {t("Closed")} {state.closedAt}
          </span>
          <span className="text-muted-foreground">
            {state.closedBy ? `${t("by")} ${state.closedBy}` : t("automatically")}
            {state.closeKind ? ` · ${t(KIND_LABEL[state.closeKind] ?? "")}` : ""}
          </span>
          {/* Closed is not finished. The boss has the statement until he says
              otherwise, and the difference is the whole reason he gets one. */}
          {state.statementStatus === "SUBMITTED" ? (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning">
              {t("with the boss")}
            </span>
          ) : state.statementStatus === "CONFIRMED" ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
              {t("confirmed by the boss")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setReopening((open) => !open)}
            className="ml-auto text-xs font-medium text-brand hover:underline"
          >
            {reopening ? t("Cancel") : t("Reopen")}
          </button>
        </div>

        {state.closeNote ? (
          <p className="border-t px-5 py-2 text-xs text-muted-foreground">
            {state.closeNote}
          </p>
        ) : null}

        {reopening ? (
          <form action={reopen} className="border-t px-5 py-3">
            <input type="hidden" name="batchId" value={state.batchId} />
            <p className="mb-2 text-xs text-muted-foreground">
              {t(
                "Reopening lets costs and payments land on this batch again. Written-off bills stay written off."
              )}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Why is it being reopened")}
                </span>
                <Input
                  name="reason"
                  required
                  minLength={4}
                  placeholder={t("A late customs receipt, a payment that arrived")}
                  className="h-9 text-sm"
                />
              </label>
              <SubmitButton
                variant="ghost"
                className="h-9 gap-1.5 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
                pendingLabel={t("Reopening…")}
              >
                <LockOpen className="h-4 w-4" />
                {t("Reopen")}
              </SubmitButton>
            </div>
            <FormError state={reopenState} />
          </form>
        ) : null}
      </section>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Not yet checked off the manifest: nothing to offer.                 */
  /* ------------------------------------------------------------------ */
  if (!state.verified)
    return (
      <>
        {carriedInNote}
        {carriedInError}
      </>
    );

  /* ------------------------------------------------------------------ */
  /* Money nobody has been asked for. Closing would give it away.        */
  /* ------------------------------------------------------------------ */
  /* Sent back by the boss: the flight is open again and the reason is the
     first thing Finance needs to read. */
  const returned =
    state.statementStatus === "RETURNED" && state.reviewNote ? (
      <p className="mb-6 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-5 py-3 text-sm">
        <span className="font-medium">{t("Sent back by the boss:")}</span>{" "}
        <span className="text-muted-foreground">{state.reviewNote}</span>
      </p>
    ) : null;

  if (state.drafts > 0 || state.unbilled > 0) {
    return (
      <>
      {carriedInNote}
    {carriedInError}
      {carriedInError}
      {returned}
      <p className="mb-6 rounded-xl border border-dashed px-5 py-3 text-xs text-muted-foreground">
        {t("This batch cannot be closed yet —")}{" "}
        {state.drafts > 0
          ? `${state.drafts} ${t("still priced as a draft")}`
          : ""}
        {state.drafts > 0 && state.unbilled > 0 ? ", " : ""}
        {state.unbilled > 0 ? `${state.unbilled} ${t("with no bill at all")}` : ""}
        . {t("Nobody has been asked for that money yet.")}
      </p>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Nothing owed. One button, because auto-close only fires on payment. */
  /* ------------------------------------------------------------------ */
  if (state.unpaid.length === 0) {
    return (
      <>
      {carriedInNote}
    {carriedInError}
      {carriedInError}
      {returned}
      <form
        action={close}
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-3 shadow-soft"
      >
        <input type="hidden" name="batchId" value={state.batchId} />
        <span className="text-sm text-muted-foreground">
          {t("Everything on this batch is paid. Nothing is owed.")}
        </span>
        <SubmitButton
          variant="ghost"
          className="ml-auto h-9 gap-1.5 border border-success/35 bg-success/10 px-3 text-success hover:bg-success/20 hover:text-success"
          pendingLabel={t("Closing…")}
        >
          <Lock className="h-4 w-4" />
          {t("Close the books")}
        </SubmitButton>
        <FormError state={closeState} />
      </form>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Money still owed: a decision, per consignment.                      */
  /* ------------------------------------------------------------------ */
  return (
    <>
    {carriedInNote}
    {carriedInError}
    {returned}
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
        {/* Collapsed, this line IS the summary. Open, the panel below says it
            in full — so saying it here as well was the page telling you the
            same thing twice, three inches apart. */}
        <span className="text-sm">
          {expanded ? (
            <>
              {t("Closing")}{" "}
              <span className="font-mono font-semibold">{state.batchNumber}</span>
            </>
          ) : (
            <>
              <span className="font-medium">{state.unpaid.length}</span>{" "}
              {t(
                state.unpaid.length === 1
                  ? "piece is still owed"
                  : "pieces are still owed"
              )}{" "}
              <span className="font-display font-bold tabular-nums text-destructive">
                {money(owedUsd)}
              </span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="ml-auto text-xs font-medium text-brand hover:underline"
        >
          {expanded ? t("Cancel") : t("Close this batch anyway")}
        </button>
      </div>

      {expanded ? (
        <form action={close} className="border-t">
          {/*
            The whole flight, before anybody signs anything.

            Three blocks in the order the question is asked: what it was, what
            it earned, what it cost. The collection percentage is here rather
            than left to be worked out, because "TSh 22m expected, TSh 21m
            collected" and "96% collected" are the same fact and only one of
            them can be read at a glance.
          */}
          <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 lg:grid-cols-5">
            {[
              /* Cargo and customers are one fact about the manifest, so they
                 share a tile and free a column for the answer. */
              [
                "Cargo",
                `${state.summary.pieces} · ${state.summary.customers}`,
                `${state.summary.packages} ${t("packages")} · ${t("customers")}`,
              ],
              /*
                The three weights, in the order they resolve: what came in,
                what has been paid for, what is still sitting here. They add
                up on screen, so nobody has to trust that they do.
              */
              [
                "Landed",
                `${state.summary.kg.toFixed(1)} kg`,
                state.summary.sellRate === null
                  ? t("no rate yet")
                  : `${formatUsd(state.summary.sellRate)} ${t("a kilo")}`,
              ],
              [
                "Collected",
                money(state.summary.collectedUsd),
                `${state.summary.soldKg.toFixed(1)} kg ${t("paid for")}${
                  state.summary.expectedUsd > 0
                    ? ` · ${Math.round(
                        (state.summary.collectedUsd / state.summary.expectedUsd) * 100
                      )}%`
                    : ""
                }`,
              ],
              [
                "Still owed",
                money(state.summary.outstandingUsd),
                `${state.summary.unpaidKg.toFixed(1)} kg ${t("still here")} · ${
                  state.summary.unpaidCustomers
                } ${t(
                  state.summary.unpaidCustomers === 1 ? "customer" : "customers"
                )}`,
              ],
              /*
                The answer the whole panel is working towards, on the same row
                as the questions. Billed less every cost recorded against the
                flight — green when it made money, red when it lost it, which
                is the owner's call and the one place on this screen where
                colour is asked to carry the verdict rather than the category.
              */
              [
                state.summary.profitUsd < 0 ? "Expected loss" : "Expected profit",
                money(Math.abs(state.summary.profitUsd)),
                `${money(state.summary.expectedUsd)} ${t("less")} ${money(
                  state.summary.expensesUsd
                )}`,
              ],
            ].map(([label, value, sub], i) => (
              <div key={label} className="bg-card px-4 py-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(label)}
                </dt>
                <dd
                  className={`mt-0.5 font-display text-sm font-bold tabular-nums ${
                    i === 2
                      ? "text-success"
                      : i === 3
                        ? "text-destructive"
                        : i === 4
                          ? state.summary.profitUsd < 0
                            ? "text-destructive"
                            : "text-success"
                          : ""
                  }`}
                >
                  {value}
                </dd>
                <p className="text-[11px] tabular-nums text-muted-foreground">{sub}</p>
              </div>
            ))}
          </dl>

          {/* What it cost, split by what it was for. A total the boss can only
              accept or query becomes a list he can read. */}
          {state.summary.expenseByCategory.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2.5 text-xs">
              <span className="font-medium">
                {t("Costs")} {money(state.summary.expensesUsd)}
              </span>
              {state.summary.expenseByCategory.map((row) => (
                <span key={row.label} className="text-muted-foreground">
                  {t(row.label)}{" "}
                  <span className="tabular-nums text-destructive">
                    {money(row.usd)}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="border-b px-5 py-2.5 text-xs text-signal">
              {t(
                "No costs recorded against this flight. Customs and clearing are always paid, so a zero means nobody has written them down."
              )}
            </p>
          )}
          <input type="hidden" name="batchId" value={state.batchId} />

          <p className="px-5 py-3 text-xs text-muted-foreground">
            {/*
              An instruction with a door in it.

              This said "correct the cost or the price below" and gave no way
              to — which is a sentence telling somebody to do something and
              leaving them to hunt for it. The costs are a link now, and the
              prices are named where they actually live.
            */}
            <span className="text-foreground">
              {t("Wrong figure?")}{" "}
              <a
                href="#batch-costs"
                className="font-medium text-brand underline underline-offset-2"
              >
                {t("Fix a cost")}
              </a>{" "}
              {t("or edit a price on the cargo list below — once this is closed the statement is frozen.")}
            </span>{" "}
            {t(
              "Every piece keeps being chased here unless you say otherwise. Carry one to a live batch and the chase moves with the cargo; write one off and its bill leaves this batch's revenue, so the profit becomes what it really made."
            )}
          </p>

          <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto border-t">
            {state.unpaid.map((row) => {
              const choice = decisionFor(row.invoiceId);
              return (
                <li
                  key={row.invoiceId}
                  className="flex h-11 items-center gap-3 px-5 text-sm"
                >
                  <span className="w-28 shrink-0 truncate font-mono text-xs">
                    {row.trackingNumber}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                    {row.customerName}
                  </span>
                  {/*
                    The decision is carried by a hidden field per choice rather
                    than by the select itself, because the action reads two
                    different lists — what is being written off and what is
                    moving — and a select posting one name for three meanings
                    would have to be untangled on the server.
                  */}
                  {choice === "writeOff" ? (
                    <input type="hidden" name="writeOff" value={row.invoiceId} />
                  ) : null}
                  {choice === "carry" ? (
                    <input type="hidden" name="carry" value={row.invoiceId} />
                  ) : null}
                  <NativeSelect
                    aria-label={row.trackingNumber}
                    value={choice}
                    onChange={(event) =>
                      setDecisions((prev) => ({
                        ...prev,
                        [row.invoiceId]: event.target.value as Choice,
                      }))
                    }
                    className="h-8 w-48 shrink-0 bg-card text-xs"
                  >
                    {CHOICES.map((option) => (
                      <option key={option.key} value={option.key}>
                        {t(option.label)}
                      </option>
                    ))}
                  </NativeSelect>
                  <span
                    className={`w-28 shrink-0 text-right font-medium tabular-nums ${
                      choice === "writeOff"
                        ? "text-muted-foreground line-through"
                        : "text-destructive"
                    }`}
                  >
                    {money(row.owedUsd)}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Only asked for once, and only when something is actually moving. */}
          {carrying > 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-t px-5 py-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Carry that cargo to")}
                </span>
                <NativeSelect
                  name="carryTo"
                  value={carryTo}
                  onChange={(event) => setCarryTo(event.target.value)}
                  required
                  className="h-9 w-64 bg-card text-sm"
                >
                  <option value="">{t("Choose a batch…")}</option>
                  {state.carryTargets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.batchNumber}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <p className="pb-2 text-xs text-muted-foreground">
                {t(
                  "The cargo and its bill move together, and that batch will show where it came from."
                )}
              </p>
            </div>
          ) : null}

          {/*
            The two figures the statement cannot work out for itself.

            Asked HERE because this is the moment the maths is done — the
            owner's rule is that closing a batch is when the flight is added
            up, and the person doing it is the person who knows what the
            airline charged. Left empty, the statement goes up with the payback
            and profit columns blank, which is a fair reason for the boss to
            send it back.
          */}
          <div className="border-t px-5 py-2.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {state.kg.toFixed(1)} kg
              </span>{" "}
              {t("landed")} ·{" "}
              <span className="font-medium text-foreground">
                {state.soldKg.toFixed(1)} kg
              </span>{" "}
              {t("paid for")}
              {carrying > 0 ? ` · ${carrying} ${t("piece(s) carrying on")}` : ""}
              {writingOff > 0 ? ` · ${writingOff} ${t("piece(s) written off")}` : ""}
            </p>
            <div className="flex flex-wrap items-end gap-2">
                </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t bg-muted/25 px-5 py-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("Note for the boss")}
              </span>
              <Input
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("Chased three times, no answer")}
                className="h-9 bg-card text-sm"
              />
            </label>
            <button
              type="button"
              disabled={carrying > 0 && !carryTo}
              onClick={() => setConfirming(true)}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md border border-brand/35 bg-brand/10 px-3 text-sm font-medium text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {t("Review and close…")}
            </button>
          </div>
          {/*
            The last thing anybody reads before the books shut.

            Everything the close is about to do, in the words of what it does
            to people: how many are still being chased, what is moving to which
            flight, what is being given up on. Then one button that means it,
            and one that goes back — because "go back" has to be as easy as
            "confirm" or the confirmation is theatre.
          */}
          {confirming ? (
            <div className="border-t bg-brand/[0.04] px-5 py-4">
              <p className="font-display font-semibold">
                {t("Close")} {state.batchNumber}?
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {state.summary.pieces} {t("pieces")}
                  </span>{" "}
                  · {state.summary.kg.toFixed(1)} kg ·{" "}
                  {state.summary.customers} {t("customers")} ·{" "}
                  {t("collected")}{" "}
                  <span className="text-success">
                    {money(state.summary.collectedUsd)}
                  </span>{" "}
                  {t("of")} {money(state.summary.expectedUsd)} ·{" "}
                  {t("costs")}{" "}
                  <span className="text-destructive">
                    {money(state.summary.expensesUsd)}
                  </span>
                </li>
                {countFor("chase") > 0 ? (
                  <li>
                    <span className="font-medium">{countFor("chase")}</span>{" "}
                    {t("still chased on this batch")} —{" "}
                    <span className="tabular-nums text-destructive">
                      {money(totalFor("chase"))}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {t("stays owed and collectable")}
                    </span>
                  </li>
                ) : null}
                {carrying > 0 ? (
                  <li>
                    <span className="font-medium">{carrying}</span>{" "}
                    {t("carried to")}{" "}
                    <span className="font-mono">
                      {state.carryTargets.find((b) => b.id === carryTo)
                        ?.batchNumber ?? "—"}
                    </span>{" "}
                    —{" "}
                    <span className="tabular-nums text-destructive">
                      {money(totalFor("carry"))}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {t("moves with the cargo, still owed")}
                    </span>
                  </li>
                ) : null}
                {writingOff > 0 ? (
                  <li>
                    <span className="font-medium">{writingOff}</span>{" "}
                    {t("written off")} —{" "}
                    <span className="tabular-nums text-destructive">
                      {money(totalFor("writeOff"))}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {t("leaves this batch's revenue for good")}
                    </span>
                  </li>
                ) : null}
                <li className="text-muted-foreground">
                  {note.trim()
                    ? `${t("Your note")}: "${note.trim()}"`
                    : t("No note for the boss.")}
                </li>
                <li className="text-muted-foreground">
                  {t(
                    "It goes to the boss to confirm, and nothing more can be recorded against it until he does."
                  )}
                </li>
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SubmitButton
                  variant="ghost"
                  className="h-9 gap-1.5 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
                  pendingLabel={t("Closing…")}
                >
                  <Lock className="h-4 w-4" />
                  {t("Yes, close it")}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="focus-ring h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t("Go back and change something")}
                </button>
                <a
                  href="#batch-costs"
                  className="text-xs font-medium text-brand underline underline-offset-2"
                >
                  {t("A cost is wrong")}
                </a>
              </div>
            </div>
          ) : null}

          <div className="px-5 pb-3">
            <FormError state={closeState} />
          </div>
        </form>
      ) : null}
    </section>
    </>
  );
}
