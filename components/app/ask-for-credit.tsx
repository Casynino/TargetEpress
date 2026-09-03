"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Search, X } from "lucide-react";

import { CreditRequest } from "@/components/app/credit-request";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  creditCandidates,
  creditContextFor,
  type CreditCandidate,
} from "@/lib/actions/credit";

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "USD" : "TSh"} ${n.toLocaleString("en-US", {
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  })}`;

/**
 * A bill in shillings, with the dollars underneath — the owner's rule.
 *
 * Pricing is done in dollars, customers pay in shillings and the office counts
 * in shillings, so every figure leads in TSh and carries the USD it was billed
 * at. Converted at the rate frozen on the bill, never today's.
 */
function inShillings(usd: number, rate: number | null) {
  return rate === null ? null : `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`;
}

/**
 * "This customer wants to take the cargo now and pay later" — from the list.
 *
 * Asking for credit used to begin at a bill somebody had to already know how to
 * find: leave the queue, search the cargo, open the invoice, then ask. But the
 * question arrives on the phone — a customer rings, the desk has their name and
 * nothing else — so this opens holding every bill the question could be about,
 * and the search box narrows it rather than being the only way in.
 *
 * Deliberately the same shape as Record Payment. The two are the same act from
 * the desk's side: find the customer's bill, do one thing to it. A second
 * pattern for the second job is a second thing to learn.
 *
 * The ask itself is CreditRequest, unchanged — the terms, the note, and the
 * sentence about who decides are written once and are already right. This is a
 * way in, not a second form.
 */
export function AskForCredit({
  rate,
  canApprove,
}: {
  /** Today's USD→TZS, for bills that carry no frozen rate of their own. */
  rate: number | null;
  /**
   * The reader can grant what they ask for.
   *
   * Finance pressing "Ask for credit" and landing in a queue behind itself was
   * ceremony. When the person acting holds the authority the words say so — and
   * they have to say it before the press, not after.
   */
  canApprove: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CreditCandidate[]>([]);
  const [picked, setPicked] = useState<CreditCandidate | null>(null);
  const [loading, start] = useTransition();

  /*
    Loaded when the panel opens, and again as the search is typed after a pause.

    A customer name is a dozen keystrokes, so firing on each one would be a
    query per letter for a result nobody has finished asking for. 250ms covers
    typing and still feels like it is keeping up.
  */
  useEffect(() => {
    if (!open || picked) return;
    const term = query.trim();
    const timer = setTimeout(() => {
      start(async () => setRows(await creditCandidates(term)));
    }, term.length === 0 ? 0 : 250);
    return () => clearTimeout(timer);
  }, [open, query, picked]);

  function close() {
    setOpen(false);
    setPicked(null);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-warning"
      >
        <CalendarClock className="h-4 w-4" />
        {canApprove ? t("Release on credit") : t("Ask for credit")}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8">
      {/* Clicking the dark ground closes it; the panel swallows its own clicks
          so a stray one inside the form does not throw the work away. */}
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className="absolute inset-0 cursor-default"
      />
      <section className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-warning/30 bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-warning/20 bg-warning/[0.06] px-5 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            {canApprove ? t("Release on credit") : t("Ask for credit")}
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

        {picked === null ? (
          <div className="px-5 py-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Customer name, tracking number, invoice or phone…")}
                className="pl-9"
                aria-label={t("Find the bill")}
              />
            </label>

            <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
              {loading && rows.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {t("Looking…")}
                </li>
              ) : rows.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {query.trim().length >= 2
                    ? t("Nothing matches that. Try the tracking number.")
                    : t("Every bill either has credit on it already or is settled.")}
                </li>
              ) : (
                rows.map((row) => (
                  <li key={row.invoiceId}>
                    <button
                      type="button"
                      onClick={() => setPicked(row)}
                      className="group flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="font-mono text-xs font-semibold">
                        {row.trackingNumber ?? row.invoiceNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {row.customerName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.goods}
                        </span>
                        {/* Where they already stand. An ask made without this
                            is an ask Finance has to research before it can
                            answer. */}
                        {row.alreadyOwesUsd > 0.005 ? (
                          <span className="ml-2 text-[11px] text-warning">
                            {t("already owes")}{" "}
                            {money(row.alreadyOwesUsd, "USD")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-destructive">
                          {row.currency === "TZS"
                            ? money(row.outstanding, "TZS")
                            : (inShillings(row.outstanding, row.rate ?? rate) ??
                              money(row.outstanding, row.currency))}
                        </span>
                        {row.currency === "USD" ? (
                          <span className="block text-[11px] tabular-nums text-muted-foreground">
                            {money(row.outstanding, "USD")}
                          </span>
                        ) : null}
                      </span>
                      <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors group-hover:border-warning/40 group-hover:text-warning sm:inline">
                        {canApprove ? t("Release it") : t("Ask")}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2.5">
              <span className="font-mono text-xs font-semibold">
                {picked.trackingNumber ?? picked.invoiceNumber}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {picked.customerName}
                <span className="ml-2 text-xs text-muted-foreground">
                  {picked.invoiceNumber}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {t("pick another")}
              </button>
            </div>

            {/* The ask itself, unchanged — one form for this whether it is
                reached from here, from the bill, or from the cargo page. */}
            <CreditRequest
              invoiceId={picked.invoiceId}
              outstanding={money(picked.outstanding, picked.currency)}
              defaultTerm={picked.termDays}
              limitLabel={
                picked.limitUsd === null ? null : money(picked.limitUsd, "USD")
              }
              outstandingLabel={
                picked.alreadyOwesUsd > 0.005
                  ? money(picked.alreadyOwesUsd, "USD")
                  : null
              }
              startOpen
              canApprove={canApprove}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The same ask, from an icon on a row.
 *
 * Pressing the credit icon used to open the invoice, where you pressed "Ask for
 * credit" a second time to get the form — a step that existed only because two
 * screens met, and precisely the kind the owner asked to have taken out. It
 * opens the form.
 *
 * The bill is re-checked on open rather than trusted from the row: the list may
 * have been fetched minutes ago, and terms must not be granted on a bill that
 * has since been paid or already has credit on it.
 */
export function CreditOnRow({
  invoiceId,
  label,
  canApprove,
}: {
  invoiceId: string;
  /** What the icon promises, matched to what the reader may actually do. */
  label: string;
  canApprove: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<CreditCandidate | null>(null);
  const [gone, setGone] = useState(false);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    start(async () => {
      const found = await creditContextFor(invoiceId);
      if (found) setRow(found);
      else setGone(true);
    });
  }, [open, invoiceId]);

  function close() {
    setOpen(false);
    setRow(null);
    setGone(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-chart-4/40 text-chart-4 transition-colors hover:bg-chart-4/10"
      >
        <CalendarClock className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8">
          <button
            type="button"
            aria-label={t("Close")}
            onClick={close}
            className="absolute inset-0 cursor-default"
          />
          <section className="relative w-full max-w-lg overflow-hidden rounded-xl border border-warning/30 bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-warning/20 bg-warning/[0.06] px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                {label}
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

            <div className="px-5 py-4">
              {gone ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "This bill can no longer be put on credit — it has been settled, or credit has already been asked for."
                  )}
                </p>
              ) : loading || !row ? (
                <p className="text-sm text-muted-foreground">{t("Looking…")}</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2.5">
                    <span className="font-mono text-xs font-semibold">
                      {row.trackingNumber ?? row.invoiceNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.customerName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.invoiceNumber}
                      </span>
                    </span>
                  </div>
                  <CreditRequest
                    invoiceId={row.invoiceId}
                    outstanding={money(row.outstanding, row.currency)}
                    defaultTerm={row.termDays}
                    limitLabel={
                      row.limitUsd === null ? null : money(row.limitUsd, "USD")
                    }
                    outstandingLabel={
                      row.alreadyOwesUsd > 0.005
                        ? money(row.alreadyOwesUsd, "USD")
                        : null
                    }
                    startOpen
                    canApprove={canApprove}
                  />
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
