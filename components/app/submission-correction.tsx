"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, Eye, Pencil, X } from "lucide-react";

import {
  AttachmentManager,
  type Attachment,
} from "@/components/app/attachment-manager";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  editSubmission,
  resubmitSubmission,
  withdrawSubmission,
} from "@/lib/actions/submission-corrections";
import type { ActionResult } from "@/lib/actions/types";

/* Byte-identical to the ledger's own trigger class. The two dialogs are the
   same door and have to look like it from the outside as well as the inside. */
const pillButton =
  "focus-ring inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent";

export type SubmissionSubject = {
  submissionId: string;
  submissionNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  /** What the customer handed over — not necessarily the bill's currency. */
  currency: string;
  outstanding: number;
  /**
   * The currency the BILL is in, which is the unit `outstanding` is expressed
   * in. Distinct from `currency` above and it has to be: a dollar invoice is
   * routinely settled in shillings, and printing what is owed with the
   * tendered currency's symbol turned USD 13.50 into "owed TSh 14".
   */
  invoiceCurrency: string;
  /** The rate frozen on the bill, so switching currency restates the same money. */
  invoiceRate: number | null;
  accountId: string | null;
  /** Where the money really went, once Finance decided. Null while pending. */
  settledAccountName: string | null;
  reference: string | null;
  note: string | null;
  status: string;
  submittedByName: string | null;
  submittedAtLabel: string;
  reviewedByName: string | null;
  rejectionReason: string | null;
  receiptNumber: string | null;
  proofs: Attachment[];
  /** The claim raised to answer this one, once somebody has. */
  replacedByNumber: string | null;
  /** The refused claim this one was raised to replace. */
  replacesNumber: string | null;
};

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "USD" : "TSh"} ${n.toLocaleString("en-US", {
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  })}`;

/**
 * Fixing, deleting or simply reading a claim, in the dialog Finance uses.
 *
 * This was a strip of unlabelled inputs squeezed into the right-hand end of a
 * table row: an amount box 110 pixels wide, a reason typed into a placeholder,
 * no heading, no attachments, and no way to see what the claim actually said.
 * The owner's instruction was plain — the same thing Finance gets when it
 * corrects a record on the ledger. So it is the same shape: portalled to the
 * body, one panel, a real label on every field, evidence managed in place, and
 * the delete door reachable from inside the edit rather than only from a
 * second button on the row.
 *
 * Three modes off one panel:
 *
 *   EDIT, while the claim is pending. Nothing has moved — no ledger line, no
 *   receipt, no change to the bill — which is exactly why a claim can be
 *   edited in place while a payment cannot: there is no receipt in anybody's
 *   hand for this to disagree with.
 *
 *   DELETE, also while pending. Recorded as withdrawn by us rather than
 *   refused by Finance, because "we sent this by mistake" and "Finance said
 *   no" are different facts about a customer.
 *
 *   OPEN, once Finance has decided. The register used to drop its controls at
 *   exactly the moment somebody most wants to know what happened — who agreed
 *   it and on what receipt, or why it came back. Every row keeps a door now,
 *   and after a decision that door is read-only.
 */
export function SubmissionCorrection({
  subject,
  accounts,
  canEdit,
  canDelete = true,
}: {
  subject: SubmissionSubject;
  accounts: { id: string; name: string; currency: string }[];
  /** Whether this reader may change the claim, as opposed to only read it. */
  canEdit: boolean;
  /**
   * Finance corrects a claim it is about to decide, but does not take it back
   * — refusing somebody else's claim is Send back, which records who refused
   * it and why. Deleting is the raiser's own undo.
   */
  canDelete?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "withdraw" | "view" | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(subject.amount));
  /* What the customer handed over. Held in state because the account list
     depends on it — an account holds one currency, and the action refuses a
     mismatch, so offering a shilling account for a claim marked USD is
     offering a choice that can only end in an error message. */
  const [currency, setCurrency] = useState(subject.currency);
  const [accountId, setAccountId] = useState(subject.accountId ?? "");
  const [reference, setReference] = useState(subject.reference ?? "");
  const [note, setNote] = useState(subject.note ?? "");
  const [reason, setReason] = useState("");
  /* New evidence for a claim being sent up again. Optional on purpose — often
     the fix is a corrected figure and the screenshot never changed — but often
     enough the missing screenshot IS why it came back. */
  const proofRef = useRef<HTMLInputElement>(null);

  const editable = subject.status === "PENDING" && canEdit;
  /*
    A refused claim is not finished business — it is the desk's next job.

    The Sent back list was a dead end: it said "Finance could not verify this"
    and offered nothing but a read-only view, so raising the corrected claim
    meant leaving the list, finding the cargo and retyping everything the
    refused one already said. Twenty-one rows of that is a list nobody works.

    Withdrawn counts too: taken back by mistake is the easiest thing of all to
    put right. Once somebody HAS answered it, there is nothing left to do here
    but read it.
  */
  const canRaiseAgain =
    canEdit &&
    !subject.replacedByNumber &&
    (subject.status === "REJECTED" || subject.status === "WITHDRAWN");

  /*
    Switching the currency restates the figure; it does not relabel it.

    Typing 1,218,375 and flipping to USD used to leave 1,218,375 sitting there
    as dollars — a shilling figure wearing the wrong symbol, and a claim nobody
    could verify. The same money at the rate frozen onto the bill is 451.25,
    which is exactly what the bill says is owed.

    At the invoice's own rate, never today's: the customer was quoted that one,
    and converting at a newer rate lands the claim a few hundred shillings off
    the balance it is meant to settle.
  */
  function pickCurrency(next: string) {
    if (next !== currency) {
      const rate = subject.invoiceRate;
      const value = Number(amount);
      if (rate && rate > 0 && Number.isFinite(value) && value > 0) {
        const restated = next === "USD" ? value / rate : value * rate;
        setAmount(
          next === "USD" ? restated.toFixed(2) : String(Math.round(restated))
        );
      }
    }
    setCurrency(next);
    const still = accounts.find(
      (a) => a.id === accountId && a.currency === next
    );
    if (!still) setAccountId("");
  }

  function close() {
    setOpen(null);
    setError(null);
    setReason("");
  }

  /* The ledger's own submit shape: run the action, close on success, refresh
     so the row underneath shows what changed. The old form left the panel open
     on success, so a desk could not tell a saved correction from a silent
     failure. */
  function run(
    build: () => FormData,
    act: (fd: FormData) => Promise<ActionResult<unknown>>
  ) {
    setError(null);
    start(async () => {
      const result = await act(build());
      if (!result.ok) {
        setError(result.error ?? t("That could not be saved."));
        return;
      }
      close();
      router.refresh();
    });
  }

  const saveEdit = () =>
    run(
      () => {
        const fd = new FormData();
        fd.set("submissionId", subject.submissionId);
        fd.set("amount", amount);
        fd.set("currency", currency);
        if (accountId) fd.set("accountId", accountId);
        fd.set("reference", reference);
        fd.set("note", note);
        fd.set("reason", reason);
        return fd;
      },
      (fd) => editSubmission(undefined, fd)
    );

  const raiseAgain = () =>
    run(
      () => {
        const fd = new FormData();
        fd.set("submissionId", subject.submissionId);
        fd.set("amount", amount);
        fd.set("currency", currency);
        fd.set("accountId", accountId);
        fd.set("reference", reference);
        fd.set("note", note);
        fd.set("reason", reason);
        const file = proofRef.current?.files?.[0];
        if (file) fd.set("proof", file);
        return fd;
      },
      (fd) => resubmitSubmission(undefined, fd)
    );

  const deleteIt = () =>
    run(
      () => {
        const fd = new FormData();
        fd.set("submissionId", subject.submissionId);
        fd.set("reason", reason);
        return fd;
      },
      (fd) => withdrawSubmission(undefined, fd)
    );

  /* Said only when it is true. A claim whose figure or account has been moved
     is a different claim from the one Finance is looking at, and the desk
     should be told so before it saves rather than after. */
  const moved =
    Number(amount) !== subject.amount ||
    currency !== subject.currency ||
    (accountId || null) !== subject.accountId;

  const context = (
    <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{subject.customerName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {subject.submissionNumber}
        </span>
      </div>
      {subject.customerPhone ? (
        <p className="text-xs text-muted-foreground">{subject.customerPhone}</p>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <a
          href={`/app/cargo/${subject.trackingNumber}`}
          className="font-mono hover:text-brand"
        >
          {subject.trackingNumber}
        </a>
        <span aria-hidden>·</span>
        <a
          href={`/app/finance/invoices/${subject.invoiceId}`}
          className="font-mono hover:text-brand"
        >
          {subject.invoiceNumber}
        </a>
        <span aria-hidden>·</span>
        <span>
          {t("owed")} {money(subject.outstanding, subject.invoiceCurrency)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Submitted by")}{" "}
        <span className="text-brand">{subject.submittedByName ?? "—"}</span> ·{" "}
        {subject.submittedAtLabel}
      </p>
      {/* What became of it — the whole reason a decided claim keeps a door.
          The account named here is the payment's, not the claim's: it is where
          the money actually landed, and on an older claim it is the only one
          there is. */}
      {subject.status === "VERIFIED" ? (
        <p className="text-xs text-success">
          {t("Verified by")} {subject.reviewedByName ?? t("Finance")}
          {subject.settledAccountName
            ? ` · ${t("into")} ${subject.settledAccountName}`
            : ""}
          {subject.receiptNumber ? ` · ${subject.receiptNumber}` : ""}
        </p>
      ) : null}
      {/* Not while the edit banner is showing the same sentence in red three
          lines below — one fact, said once. */}
      {subject.status === "REJECTED" && open !== "edit" ? (
        <p className="text-xs text-destructive">
          {t("Sent back by")} {subject.reviewedByName ?? t("Finance")}
          {subject.rejectionReason ? `: ${subject.rejectionReason}` : ""}
        </p>
      ) : null}
      {subject.replacedByNumber ? (
        <p className="text-xs text-success">
          {t("Raised again as")} {subject.replacedByNumber}
        </p>
      ) : null}
      {subject.replacesNumber ? (
        <p className="text-xs text-muted-foreground">
          {t("Replaces")} {subject.replacesNumber}
        </p>
      ) : null}
      {subject.status === "WITHDRAWN" ? (
        <p className="text-xs text-muted-foreground">
          {t("Withdrawn")}
          {subject.rejectionReason ? `: ${subject.rejectionReason}` : ""}
        </p>
      ) : null}
    </div>
  );

  const heading =
    open === "withdraw"
      ? t("Delete this submission")
      : open === "view"
        ? t("What was submitted")
        : canRaiseAgain
          ? t("Fix it and send it up again")
          : t("Correct this submission");

  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      {editable || canRaiseAgain ? (
        <>
          <button
            type="button"
            onClick={() => setOpen("edit")}
            className={pillButton}
          >
            <Pencil className="h-3.5 w-3.5" />
            {canRaiseAgain ? t("Fix and send again") : t("Edit Payment")}
          </button>
          {canDelete && (editable || canRaiseAgain) ? (
            <button
              type="button"
              onClick={() => setOpen("withdraw")}
              className={`${pillButton} hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive`}
            >
              <Ban className="h-3.5 w-3.5" />
              {t("Delete Payment")}
            </button>
          ) : null}
        </>
      ) : (
        /* Decided, or this reader may not change it. Either way the claim is
           still worth opening — the register used to simply drop its controls
           and leave nothing at all to press. */
        <button
          type="button"
          onClick={() => setOpen("view")}
          className={pillButton}
        >
          <Eye className="h-3.5 w-3.5" />
          {t("Open")}
        </button>
      )}

      {open
        ? createPortal(
            /* Portalled to the body for the same reason the ledger's dialog is:
               the register sits inside an overflow-x-auto ancestor, and that
               ancestor clips even a position:fixed child — so the backdrop
               darkened the list's own rectangle and left the rest of the page
               lit up through the dialog sitting on top of it. */
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
              <div className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display font-semibold">{heading}</h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t("Close")}
                    className="focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {context}

                {open === "edit" ? (
                  <>
                    {/* What Finance said, kept in front of whoever is fixing
                        it — the correction is an answer to this sentence. */}
                    {/*
                      What Finance said, marked as THEIR words rather than as
                      an instruction to the reader.

                      Refusals had been typed as advice about what would happen
                      next — "will update through batch" — and printed plain
                      after a colon they read as a direction: wait for the
                      batch. They are not directions. The desk can fix the
                      claim here and send it straight back up, so the panel
                      says that underneath in its own voice.
                    */}
                    {canRaiseAgain ? (
                      <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2">
                        <p className="text-xs font-medium text-destructive">
                          {t("Sent back by")}{" "}
                          {subject.reviewedByName ?? t("Finance")}
                        </p>
                        {subject.rejectionReason ? (
                          <p className="text-xs italic text-destructive/90">
                            “{subject.rejectionReason}”
                          </p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">
                          {t(
                            "Fix whatever was wrong below and send it straight back up — nothing has to wait for anything else."
                          )}
                        </p>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="sub-amount">{t("How much came in")}</Label>
                        <Input
                          id="sub-amount"
                          inputMode="decimal"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        {/* Correctable, because a dollar bill settled in
                            shillings and typed as dollars is an ordinary
                            mistake — and because it decides which accounts
                            below could have taken the money. */}
                        <Label htmlFor="sub-currency">{t("Paid in")}</Label>
                        <NativeSelect
                          id="sub-currency"
                          value={currency}
                          onChange={(event) => pickCurrency(event.target.value)}
                        >
                          <option value="TZS">TZS</option>
                          <option value="USD">USD</option>
                        </NativeSelect>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="sub-account">
                          {t("Where did it land")}
                        </Label>
                        <NativeSelect
                          id="sub-account"
                          value={accountId}
                          onChange={(event) => setAccountId(event.target.value)}
                        >
                          {/* Selectable, not disabled: a claim raised before
                              naming an account was compulsory has none, and a
                              disabled selected option makes the control look
                              stuck. Leaving it as it stands is a no-op. */}
                          <option value="">{t("no account named")}</option>
                          {/* Only accounts that could really have taken this
                              money. An account holds one currency, and
                              editSubmission refuses a mismatch — so listing the
                              others offers a choice that can only end in an
                              error message. */}
                          {accounts
                            .filter((a) => a.currency === currency)
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                        </NativeSelect>
                      </div>
                    </div>

                    <p
                      className={`text-xs ${
                        moved ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {moved
                        ? t(
                            "Nothing has moved yet, so this only corrects the claim before Finance decides it. The change is recorded against your name."
                          )
                        : t(
                            "What the claim says now. Type or pick over it to correct it."
                          )}
                    </p>

                    <div className="space-y-1.5">
                      <Label htmlFor="sub-reference">{t("Reference")}</Label>
                      <Input
                        id="sub-reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder={t("M-Pesa code, slip number")}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sub-note">{t("Note")}</Label>
                      <Input
                        id="sub-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}

                {open === "withdraw" ? (
                  <p className="text-sm text-muted-foreground">
                    {canRaiseAgain
                      ? t(
                          "Nothing moved, so nothing is undone. The bill stays exactly as it is and the cargo stays on the chase list — when the money does arrive, record it again from scratch."
                        )
                      : t(
                          "Nothing has moved yet, so deleting it costs the customer nothing. It is recorded as withdrawn by us, not refused by Finance."
                        )}
                  </p>
                ) : null}

                {/* The evidence, on every mode but the delete — read-only once
                    decided. This is where "nothing attached" can finally be
                    answered rather than only complained about on the row. */}
                {open !== "withdraw" ? (
                  <div className="space-y-1.5">
                    <Label>{t("The customer's evidence")}</Label>
                    <AttachmentManager
                      kind="submission"
                      parentId={subject.submissionId}
                      attachments={subject.proofs}
                      editable={editable}
                    />
                    {canRaiseAgain ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "The evidence already on this claim goes up with the new one."
                          )}
                        </p>
                        {/* Added to the NEW claim, never to the refused one —
                            what Finance was looking at when they said no has
                            to stay exactly as it was. */}
                        <input
                          ref={proofRef}
                          type="file"
                          name="proof"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-2.5 file:py-1 file:text-xs file:text-foreground hover:file:bg-accent"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "Add the customer's proof if you have it now — optional, but it is often why this came back."
                          )}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {open !== "view" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-reason">
                      {open === "withdraw"
                        ? t("Why is it being deleted?")
                        : canRaiseAgain
                          ? t("What did you fix?")
                          : t("What was wrong with it?")}
                    </Label>
                    <Textarea
                      id="sub-reason"
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t("Reference typed wrong")}
                    />
                  </div>
                ) : null}

                {/* Deleting is reachable from inside the edit, so somebody who
                    opened the wrong door does not have to close it and go
                    looking for the other one. */}
                {open === "edit" && canDelete && (editable || canRaiseAgain) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen("withdraw");
                      setError(null);
                    }}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                  >
                    {t("Delete this submission instead")}
                  </button>
                ) : null}

                {open === "view" && subject.status === "VERIFIED" ? (
                  <a
                    href={`/app/finance/invoices/${subject.invoiceId}`}
                    className="block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t("Verified — cancel the payment on the invoice")}
                  </a>
                ) : null}

                {error ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {open !== "view" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={open === "withdraw" ? "destructive" : "default"}
                      disabled={pending || reason.trim().length < 3}
                      onClick={
                        open === "withdraw"
                          ? deleteIt
                          : canRaiseAgain
                            ? raiseAgain
                            : saveEdit
                      }
                    >
                      {pending
                        ? t("Working…")
                        : open === "withdraw"
                          ? t("Delete it")
                          : canRaiseAgain
                            ? t("Send it up again")
                            : t("Save the correction")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={close}
                  >
                    {t("Leave it")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
