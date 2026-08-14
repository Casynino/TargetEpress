"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Lock, LockOpen } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { closeBatch, reopenBatch } from "@/lib/actions/batches";
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
  carriedIn: { trackingNumber: string; fromBatchNumber: string }[];
  /** Whatever has already been entered for this flight, if anything. */
  freightRate: number | null;
  customsRate: number | null;
  /** Everything that landed on this flight, so the panel can show the sum. */
  kg: number;
  /** Weight whose bill is settled, and weight nobody has paid for yet. */
  soldKg: number;
  /** What the flight was billed at — the yardstick a payback is judged against. */
  worthUsd: number;
  /** Where the statement has got to, once there is one. */
  statementStatus: string | null;
  reviewNote: string | null;
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
    The payback, worked out as it is typed.

    A per-kilo rate is the one field on this panel where a wrong unit is
    invisible: 2000 and 8 look equally like numbers, and only the product says
    which one was meant. Somebody entered shillings into a dollars box on a
    three-kilo flight and the statement went to the boss saying it had lost
    fourteen thousand dollars. Showing the multiplication removes the guess —
    "3 kg × USD 5,000.00 = USD 15,000.00" is wrong on sight in a way that
    "5000" in a box never is.
  */
  const [freight, setFreight] = useState<string>(
    state.freightRate === null ? "" : String(state.freightRate)
  );
  const [customs, setCustoms] = useState<string>(
    state.customsRate === null ? "" : String(state.customsRate)
  );
  const num = (text: string) => {
    const value = Number(text.trim().replace(/,/g, ""));
    return text.trim() === "" || !Number.isFinite(value) ? null : value;
  };
  const landed =
    num(freight) === null && num(customs) === null
      ? null
      : (num(freight) ?? 0) + (num(customs) ?? 0);
  const payback = landed === null ? null : state.kg * landed;
  /*
    A payback several times what the flight billed is not a rate, it is a unit
    mistake — shillings typed into a dollars box.

    Measured against what the flight is WORTH, not against what is still owed.
    The first version compared it to the outstanding balance, which on a flight
    where almost everyone had paid was a few dollars — so the correct rate of
    8 + 1.8 tripped the warning and the warning became noise. A yardstick has
    to be the thing being measured.

    Three times, not two: a genuinely bad flight can cost more than it earned,
    and that is a fact to report rather than a typo to catch.
  */
  const suspicious =
    payback !== null && state.worthUsd > 0 && payback > 3 * state.worthUsd;

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
      </p>
    ) : null;

  /*
    One rate block, used by BOTH close forms.

    It existed only on the money-still-owed branch. The ordinary case — every
    bill paid, which is most flights — had two unlabelled boxes and no preview,
    so the exact mistake the preview was built to catch was still wide open on
    the path most closes take. It is also the path a returned statement lands
    on: the boss sends a flight back BECAUSE the payback looked wrong, and
    Finance retypes the rate with nothing to check it against.
  */
  const rateFields = (
    <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Freight")} <span className="text-foreground">USD / kg</span>
                </span>
                <Input
                  name="freightRate"
                  inputMode="decimal"
                  value={freight}
                  onChange={(event) => setFreight(event.target.value)}
                  placeholder="8"
                  className="h-9 w-24 bg-card text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Customs")} <span className="text-foreground">USD / kg</span>
                </span>
                <Input
                  name="customsRate"
                  inputMode="decimal"
                  value={customs}
                  onChange={(event) => setCustoms(event.target.value)}
                  placeholder="1.8"
                  className="h-9 w-24 bg-card text-sm tabular-nums"
                />
              </label>
              <p className="pb-2 text-xs">
                {payback === null ? (
                  <span className="text-muted-foreground">
                    {t(
                      "Weight × these two is what has to be paid back before any of this flight is profit."
                    )}
                  </span>
                ) : (
                  <span className={suspicious ? "text-destructive" : "text-muted-foreground"}>
                    {state.kg.toFixed(1)} kg × {formatUsd(landed!)} ={" "}
                    <span className="font-medium">{formatUsd(payback)}</span>{" "}
                    {t("to pay back")}
                    {state.rate !== null
                      ? ` (${formatLocal(payback * state.rate)})`
                      : ""}
                    {suspicious
                      ? ` — ${t("that is far more than this flight earned. Are those shillings in a dollars box?")}`
                      : ""}
                  </span>
                )}
              </p>
    </>
  );

  /* ------------------------------------------------------------------ */
  /* Already closed: one line, and a way back.                           */
  /* ------------------------------------------------------------------ */
  if (state.closedAt) {
    return (
      <>
      {carriedInNote}
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
  if (!state.verified) return carriedInNote;

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
      {returned}
      <form
        action={close}
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-3 shadow-soft"
      >
        <input type="hidden" name="batchId" value={state.batchId} />
        <span className="text-sm text-muted-foreground">
          {t("Everything on this batch is paid. Nothing is owed.")}
        </span>
        {rateFields}
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
    {returned}
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
        <span className="text-sm">
          <span className="font-medium">{state.unpaid.length}</span>{" "}
          {t(
            state.unpaid.length === 1
              ? "piece is still owed"
              : "pieces are still owed"
          )}{" "}
          <span className="font-display font-bold tabular-nums text-destructive">
            {money(owedUsd)}
          </span>
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
          <input type="hidden" name="batchId" value={state.batchId} />

          <p className="px-5 py-3 text-xs text-muted-foreground">
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
          <div className="border-t px-5 py-3">
            {/* What the flight is, in kilos, before any rate is applied to it. */}
            <p className="mb-2 text-xs text-muted-foreground">
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
            {rateFields}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t bg-muted/25 px-5 py-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("Note for the boss")}
              </span>
              <Input
                name="note"
                placeholder={t("Chased three times, no answer")}
                className="h-9 bg-card text-sm"
              />
            </label>
            <SubmitButton
              variant="ghost"
              disabled={carrying > 0 && !carryTo}
              className="h-9 gap-1.5 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
              pendingLabel={t("Closing…")}
            >
              <Lock className="h-4 w-4" />
              {writingOff === 0 && carrying === 0
                ? t("Close, keeping every debt")
                : [
                    writingOff > 0
                      ? `${t("writing off")} ${money(totalFor("writeOff"))}`
                      : null,
                    carrying > 0
                      ? `${t("carrying")} ${money(totalFor("carry"))}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(` ${t("and")} `)
                    .replace(/^./, (c) => `${t("Close,")} ${c}`)}
            </SubmitButton>
          </div>
          <div className="px-5 pb-3">
            <FormError state={closeState} />
          </div>
        </form>
      ) : null}
    </section>
    </>
  );
}
