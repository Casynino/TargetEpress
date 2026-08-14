"use client";

import { useActionState, useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { closeBatch, reopenBatch } from "@/lib/actions/batches";
import { formatLocal, formatUsd } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/types";

export type UnpaidPiece = {
  invoiceId: string;
  trackingNumber: string;
  customerName: string;
  owedUsd: number;
};

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
};

const KIND_LABEL: Record<string, string> = {
  SETTLED: "everything was paid",
  DEBT_KEPT: "money still owed, still being chased",
  WRITTEN_OFF: "the rest was written off",
  MIXED: "some written off, some still being chased",
};

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
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const [closeState, close] = useActionState<
    ActionResult<{ kind: string; writtenOff: number; kept: number }>,
    FormData
  >(closeBatch, { ok: true });
  const [reopenState, reopen] = useActionState<
    ActionResult<Record<string, never>>,
    FormData
  >(reopenBatch, { ok: true });

  const money = (usd: number) =>
    state.rate === null ? formatUsd(usd) : formatLocal(usd * state.rate);

  const owedUsd = state.unpaid.reduce((sum, row) => sum + row.owedUsd, 0);
  const chosenUsd = state.unpaid
    .filter((row) => chosen.has(row.invoiceId))
    .reduce((sum, row) => sum + row.owedUsd, 0);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ------------------------------------------------------------------ */
  /* Already closed: one line, and a way back.                           */
  /* ------------------------------------------------------------------ */
  if (state.closedAt) {
    return (
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
    );
  }

  /* ------------------------------------------------------------------ */
  /* Not yet checked off the manifest: nothing to offer.                 */
  /* ------------------------------------------------------------------ */
  if (!state.verified) return null;

  /* ------------------------------------------------------------------ */
  /* Money nobody has been asked for. Closing would give it away.        */
  /* ------------------------------------------------------------------ */
  if (state.drafts > 0 || state.unbilled > 0) {
    return (
      <p className="mb-6 rounded-xl border border-dashed px-5 py-3 text-xs text-muted-foreground">
        {t("This batch cannot be closed yet —")}{" "}
        {state.drafts > 0
          ? `${state.drafts} ${t("still priced as a draft")}`
          : ""}
        {state.drafts > 0 && state.unbilled > 0 ? ", " : ""}
        {state.unbilled > 0 ? `${state.unbilled} ${t("with no bill at all")}` : ""}
        . {t("Nobody has been asked for that money yet.")}
      </p>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Nothing owed. One button, because auto-close only fires on payment. */
  /* ------------------------------------------------------------------ */
  if (state.unpaid.length === 0) {
    return (
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
    );
  }

  /* ------------------------------------------------------------------ */
  /* Money still owed: a decision, per consignment.                      */
  /* ------------------------------------------------------------------ */
  return (
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
              "Tick anything that will never be collected. Those bills leave this batch's revenue, so its profit becomes what it really made. Anything left unticked stays owed and stays chaseable."
            )}
          </p>

          <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto border-t">
            {state.unpaid.map((row) => (
              <li key={row.invoiceId}>
                <label className="flex h-11 cursor-pointer items-center gap-3 px-5 text-sm transition-colors hover:bg-muted/25">
                  <input
                    type="checkbox"
                    name="writeOff"
                    value={row.invoiceId}
                    checked={chosen.has(row.invoiceId)}
                    onChange={() => toggle(row.invoiceId)}
                    className="h-4 w-4 shrink-0 accent-destructive"
                  />
                  <span className="w-28 shrink-0 truncate font-mono text-xs">
                    {row.trackingNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {row.customerName}
                  </span>
                  <span
                    className={`w-28 shrink-0 text-right font-medium tabular-nums ${
                      chosen.has(row.invoiceId)
                        ? "text-muted-foreground line-through"
                        : "text-destructive"
                    }`}
                  >
                    {money(row.owedUsd)}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-end gap-2 border-t bg-muted/25 px-5 py-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("Note for whoever reads this later")}
              </span>
              <Input
                name="note"
                placeholder={t("Chased three times, no answer")}
                className="h-9 bg-card text-sm"
              />
            </label>
            <SubmitButton
              variant="ghost"
              className="h-9 gap-1.5 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
              pendingLabel={t("Closing…")}
            >
              <Lock className="h-4 w-4" />
              {chosen.size > 0
                ? `${t("Close, writing off")} ${money(chosenUsd)}`
                : t("Close, keeping every debt")}
            </SubmitButton>
          </div>
          <div className="px-5 pb-3">
            <FormError state={closeState} />
          </div>
        </form>
      ) : null}
    </section>
  );
}
