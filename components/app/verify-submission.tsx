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
 * Rejecting demands a reason. Support has to ring the customer and tell them
 * something, and "rejected" on its own is not something to say to anybody.
 */
export function VerifySubmission({
  submissionId,
  accounts,
}: {
  submissionId: string;
  accounts: { id: string; name: string; currency: string }[];
}) {
  const [mode, setMode] = useState<"idle" | "verify" | "reject">("idle");
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
        <div className="space-y-1">
          <Label htmlFor={`account-${submissionId}`} className="text-[11px]">
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
        <Label htmlFor={`reason-${submissionId}`} className="text-[11px]">
          Why — Support has to tell the customer something
        </Label>
        <Input
          id={`reason-${submissionId}`}
          name="reason"
          placeholder="e.g. no transaction with that code on the statement"
          className="h-9 text-sm"
          required
        />
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
