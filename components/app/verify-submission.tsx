"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  rejectPaymentSubmission,
  verifyPaymentSubmission,
} from "@/lib/actions/collections";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Finance's decision on one claim.
 *
 * Two buttons and a choice of account, because that is the whole job: is this
 * real, and where did it land. Verifying hands the figures to the same
 * recordPayment the counter uses, so a verified claim produces exactly the
 * receipt, ledger entry and pickup note a counter payment would have.
 *
 * Rejecting demands a reason, and specifically the PROBLEM rather than the next
 * step. Finance had been typing things like "will update through batch" — an
 * instruction about what would happen later, which stopped being true the day
 * Support could fix a refused claim and send it straight back from their own
 * list. What the desk needs is the fault: no such transaction, wrong figure,
 * money into an account that is not ours. That is what they ring the customer
 * about, and it is the sentence the next person reading the row is given.
 */
export function VerifySubmission({
  submissionId,
  accounts,
  currency = "TZS",
  transport = 0,
  cargo = 0,
  transportSourceId = null,
  transportSourceName = null,
  transportAccounts = [],
  shortfall = 0,
  billCurrency = "USD",
  clearShortfallClaimed = false,
}: {
  submissionId: string;
  accounts: { id: string; name: string; currency: string }[];
  /** The currency the customer sent it in — what the split below is quoted in. */
  currency?: string;
  /** The delivery half of the claim, as Support wrote it down. */
  transport?: number;
  /** The rest of it: what actually settles the bill. */
  cargo?: number;
  /** Where Support expects the fare to be paid from. Finance may change it. */
  transportSourceId?: string | null;
  transportSourceName?: string | null;
  /** Cash and Lipa accounts only — a driver is not paid out of a bank. */
  transportAccounts?: { id: string; name: string; currency: string }[];
  /** What this claim leaves owing on the bill once it is recorded, in the
      bill's own money. Zero when it settles or overpays. */
  shortfall?: number;
  billCurrency?: string;
  /** Support ticked "the rest is not coming" when they raised it. */
  clearShortfallClaimed?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "verify" | "reject">("idle");
  /*
    Support's answer, and Finance's to change.

    It starts where Support left it because that desk took the call and heard
    what the customer said. Finance is the desk that signs for it, so the tick
    here is the one that travels — and it is stated either way rather than
    left absent, so an untick on this screen means NO rather than falling back
    to the claim's own yes.
  */
  const [clearRest, setClearRest] = useState(clearShortfallClaimed);
  const [verifyState, verify] = useActionState<
    ActionResult<{ receiptNumber: string }>,
    FormData
  >(verifyPaymentSubmission, { ok: true });
  const [rejectState, reject] = useActionState<ActionResult, FormData>(
    rejectPaymentSubmission,
    { ok: true }
  );

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("verify")}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-success px-3.5 py-1.5 text-xs font-semibold text-success-foreground transition-colors hover:bg-success/90"
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          Verify payment
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          Send it back
        </button>
      </div>
    );
  }

  if (mode === "verify") {
    return (
      <form action={verify} className="space-y-2 rounded-lg border bg-card p-3">
        <input type="hidden" name="submissionId" value={submissionId} />
        {/*
          THE CLAIM ALREADY SAYS THE CUSTOMER PAID CARGO PLUS TRANSPORT.

          Finance's job here is to check a slip against a figure. When the
          customer sent one transfer covering the freight and the delivery, the
          figure on the slip is LARGER than the bill — and without this panel
          the only way to know why was to ask the person who took the call.

          So the split Support wrote down is read back before the decision:
          this much settles the bill, this much is the fare. Nothing is being
          asked of Finance except to see it — the split travels into the
          payment on its own.
        */}
        {transport > 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
            <p className="font-semibold uppercase tracking-wide">
              Cargo plus transport
            </p>
            <p className="mt-0.5 font-medium">
              {currency} {cargo.toLocaleString()} to the bill · {currency}{" "}
              {transport.toLocaleString()} transport
            </p>
          </div>
        ) : null}
        {/*
          THE CUSTOMER SENT LESS THAN THE BILL, AND SOMEBODY HAS TO SAY SO.

          The other half of the split above. A claim short of the bill leaves
          the consignment settled in everybody's head and unreleasable in the
          system until somebody remembers to go and clear the difference on the
          bill's own page — so it is asked here, where the decision is already
          being made, and the adjustment is written by the same transaction
          that records the money.

          Ticked, the payment still records exactly what the customer sent. It
          is the BILL that closes, by an adjustment that moves no money and has
          its own reversible row.
        */}
        {shortfall > 0.005 ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
            <input
              type="checkbox"
              checked={clearRest}
              onChange={(event) => setClearRest(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span>
              <span className="font-semibold">
                Clear the last {billCurrency}{" "}
                {shortfall.toLocaleString(undefined, {
                  maximumFractionDigits: billCurrency === "TZS" ? 0 : 2,
                })}{" "}
                and settle the bill
              </span>
              <span className="mt-0.5 block opacity-90">
                {clearShortfallClaimed
                  ? "Support was told the rest is not coming. "
                  : "This claim is short of the bill. "}
                The payment records what came in; the difference is written off
                and moves no money.
              </span>
            </span>
          </label>
        ) : null}
        {/* Stated either way, so an untick here is a NO rather than a silence
            the action would read as Support's yes. */}
        {shortfall > 0.005 ? (
          <input
            type="hidden"
            name="clearShortfall"
            value={clearRest ? "1" : "0"}
          />
        ) : null}
        <div className="space-y-1">
          <Label htmlFor={`account-${submissionId}`} className="text-xs">
            Where it landed
          </Label>
          {/* Finance names the account, never Support — that desk does not know
              and must not guess. */}
          <NativeSelect
            id={`account-${submissionId}`}
            name="accountId"
            className="h-9 text-sm"
          >
            <option value="">Not said yet</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {/* Where the fare leaves from. Support's answer is pre-filled because
            they usually know, and Finance can change it because they are the
            desk that actually hands it over. Cash and the Lipa number only. */}
        {transport > 0 ? (
          <div className="space-y-1">
            <Label
              htmlFor={`transport-source-${submissionId}`}
              className="text-xs"
            >
              Transport settled from
            </Label>
            <NativeSelect
              id={`transport-source-${submissionId}`}
              name="transportSourceId"
              defaultValue={transportSourceId ?? ""}
              className="h-9 text-sm"
              required
            >
              <option value="" disabled>
                Cash or the Lipa number
              </option>
              {transportAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            {transportSourceName ? (
              <p className="text-[11px] text-muted-foreground">
                Support said {transportSourceName}.
              </p>
            ) : null}
          </div>
        ) : null}
        <FormError state={verifyState} />
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" variant="brand" pendingLabel="Recording…">
            Confirm and record
          </SubmitButton>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={reject} className="space-y-2 rounded-lg border bg-card p-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="space-y-1">
        <Label htmlFor={`reason-${submissionId}`} className="text-xs">
          What is wrong with it? <span className="text-muted-foreground">(optional)</span>
        </Label>
        {/* Offered rather than demanded. It is worth writing — Support reads
            it and it is the difference between "fix it" and "fix what" — but
            a desk clearing a queue of duplicates should not have to type the
            same sentence ten times to get through it. */}
        <Input
          id={`reason-${submissionId}`}
          name="reason"
          placeholder="e.g. no transaction with that code on the statement"
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          The fault, not the next step — Support fixes it and sends it straight
          back from their own list, and this is what they tell the customer.
        </p>
      </div>
      <FormError state={rejectState} />
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" variant="outline" pendingLabel="Sending back…">
          Send it back
        </SubmitButton>
        <button
          type="button"
          onClick={() => setMode("idle")}
          className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
