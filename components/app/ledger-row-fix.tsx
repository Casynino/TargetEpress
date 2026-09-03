"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, Pencil, Undo2, X } from "lucide-react";

import { AttachmentManager, type Attachment } from "@/components/app/attachment-manager";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cancelLedgerEntry } from "@/lib/actions/ledger";
import {
  changePaymentAmount,
  editPayment,
  restorePayment,
  voidPayment,
} from "@/lib/actions/payment-corrections";
import { voidExpense, editExpense, reverseExpense } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";

export type LedgerRowSubject = {
  entryId: string;
  /** The customer payment behind this line, when there is one. */
  paymentId: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentAccountId: string | null;
  /** What the payment says now, so a correction starts from the truth. */
  amount: number;
  currency: string;
  /** False for a combined payment: moving its figure — or the account it
      landed in — means deciding which of several bills loses what, which is
      the allocation screen's question. */
  amountEditable: boolean;
  /** The recorded cost behind this line, when there is one. */
  expenseId: string | null;
  expenseDescription: string | null;
  expenseCategory: string | null;
  /** Passed through unedited — reassigning what counts towards profit is a
      rarer, more consequential change made from the batch's own cost panel,
      not typo-fixing from a ledger row. */
  expenseClass: string | null;
  expenseVendor: string | null;
  expenseNote: string | null;
  expenseAccountId: string | null;
  /** Passed through unedited so a quick correction here can never silently
      unlink a cost from the flight it belongs to. */
  expenseBatchId: string | null;
  /** yyyy-mm-dd */
  expenseIncurredAt: string | null;
  /** PENDING, APPROVED, PAID or VOID — decides whether cancelling is a void
      (nothing has moved yet) or a reversal (money already left an account). */
  expenseStatus: string | null;
  /** The evidence behind this line, editable from the same door as the figure
      it backs up. */
  attachments: Attachment[];
  /** Already answered by a reversing line — nothing left to correct here. */
  reversed: boolean;
  voidReason: string | null;
  voidedByName: string | null;
};

/*
  A proper bordered button, not text with an icon in front of it.

  Plain muted text next to a total read as a caption, the same problem the
  payment-split toggle had — a control nobody could see was one. This is the
  single record's own correct-it-or-cancel-it door, so it gets to look like a
  button wherever it appears, not just where there happens to be room.
*/
const iconButton =
  "focus-ring inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent";

/**
 * FIX THE LINE FROM THE LINE.
 *
 * Both of these existed and neither was reachable: the pencil opened the
 * invoice and the cancel opened the entry's own page, so correcting a fifty-
 * four shilling test meant leaving the register, finding the bill, and finding
 * the way back. A desk reading down a ledger is looking at the line it wants to
 * fix; the fix belongs there.
 *
 * WRITTEN, NOT JUST DRAWN. An icon nobody has to learn is one everybody has
 * already misread once — a pencil and a slashed circle at the top of a page
 * with no caption looks like decoration until it is pressed. Both controls
 * carry their own word now.
 *
 * CANCELLING IS A REVERSAL, NOT A DELETION — and it is still called "Cancel"
 * rather than "Delete" on purpose. The ledger is append-only, and that is why
 * no figure in this system has ever drifted: a wrong line is answered by a
 * line pointing back at it, so the history still reads true and the balance
 * still explains itself. What the desk means by "delete" happens in full —
 * the payment is voided, the money comes off the bill, the cargo goes back to
 * unpaid and its pickup note is withdrawn — it is simply recorded rather than
 * erased. Calling it Delete would promise the one thing this button must never
 * do to a financial record.
 *
 * A COST IS CANCELLED TWO DIFFERENT WAYS, and using the wrong one used to be
 * the only option: every cost on this register has already been paid — that is
 * the only kind that gets a ledger line at all — so "cancel" here always has
 * to mean the opposite ledger entry, never the plain VOID that only applies to
 * a cost still waiting to be paid. Sending a paid line through the unpaid door
 * used to fail with an error telling the desk to do the very thing this row
 * could not actually do.
 */
export function LedgerRowFix({
  subject,
  accounts = [],
}: {
  subject: LedgerRowSubject;
  /** Same-currency accounts a corrected cost may be paid from. Only needed
      wherever an expense subject is rendered. */
  accounts?: { id: string; name: string; currency: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<"cancel" | "edit" | "restore" | null>(null);
  const [reason, setReason] = useState("");
  /* Held, not asked for. The field is gone, but a payment recorded before it
     went carries a value, and posting an empty string over it would erase what
     somebody typed. */
  const reference = subject.paymentReference ?? "";
  const [note, setNote] = useState(subject.paymentNote ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(
    subject.paymentAccountId ?? ""
  );
  const [description, setDescription] = useState(
    subject.expenseDescription ?? ""
  );
  const [category, setCategory] = useState(subject.expenseCategory ?? "");
  const [vendor, setVendor] = useState(subject.expenseVendor ?? "");
  const [costNote, setCostNote] = useState(subject.expenseNote ?? "");
  const [accountId, setAccountId] = useState(subject.expenseAccountId ?? "");
  const [incurredAt, setIncurredAt] = useState(subject.expenseIncurredAt ?? "");
  /* Starts at what it says now, so the reader corrects a figure rather than
     recalling one. */
  const [amount, setAmount] = useState(String(subject.amount));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(null);
    setError(null);
    setReason("");
  }

  function run(build: () => FormData, act: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await act(build());
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      close();
      router.refresh();
    });
  }

  function cancelIt() {
    run(
      () => {
        const fd = new FormData();
        fd.set("reason", reason);
        if (subject.paymentId) fd.set("paymentId", subject.paymentId);
        else if (subject.expenseId) fd.set("expenseId", subject.expenseId);
        else fd.set("entryId", subject.entryId);
        return fd;
      },
      (fd) =>
        subject.paymentId
          ? voidPayment(undefined, fd)
          : subject.expenseId
            ? subject.expenseStatus === "PAID"
              ? reverseExpense(undefined, fd)
              : voidExpense(undefined, fd)
            : cancelLedgerEntry(undefined, fd)
    );
  }

  function restoreIt() {
    run(
      () => {
        const fd = new FormData();
        fd.set("paymentId", subject.paymentId!);
        fd.set("reason", reason);
        return fd;
      },
      (fd) => restorePayment(undefined, fd)
    );
  }

  const amountChanged =
    Math.abs((Number(amount) || 0) - subject.amount) > 0.005;
  const paymentAccountChanged =
    Boolean(subject.paymentId) && paymentAccountId !== (subject.paymentAccountId ?? "");

  function saveEdit() {
    /* A payment's figure — and the account it landed in — are the two fields
       that cannot simply be written over: the ledger line, the bill and the
       pickup note were all derived from them, so changing either cancels and
       re-records the whole chain. A cost's figure has no such wall —
       editExpense already reverses the paid line and posts a corrected one
       itself when the amount or the account moves, so it is one call
       either way. */
    if (subject.paymentId && (amountChanged || paymentAccountChanged)) {
      run(
        () => {
          const fd = new FormData();
          fd.set("paymentId", subject.paymentId!);
          if (amountChanged) fd.set("amount", amount);
          if (paymentAccountChanged) fd.set("accountId", paymentAccountId);
          /* Whatever else was typed on the same form travels with the
             figure/account correction, so fixing a typo alongside the amount
             does not get silently dropped. */
          fd.set("reference", reference);
          fd.set("note", note);
          fd.set("reason", reason);
          return fd;
        },
        (fd) => changePaymentAmount(undefined, fd)
      );
      return;
    }
    run(
      () => {
        const fd = new FormData();
        fd.set("reason", reason);
        if (subject.paymentId) {
          fd.set("paymentId", subject.paymentId);
          fd.set("reference", reference);
          fd.set("note", note);
        } else if (subject.expenseId) {
          fd.set("expenseId", subject.expenseId);
          fd.set("category", category);
          /* Passed through, never offered here — see the note on the type. */
          fd.set("expenseClass", subject.expenseClass ?? "OPERATING");
          fd.set("description", description);
          fd.set("vendor", vendor);
          fd.set("note", costNote);
          fd.set("batchId", subject.expenseBatchId ?? "");
          fd.set("accountId", accountId);
          fd.set("amount", amount);
          fd.set("incurredAt", incurredAt);
        }
        return fd;
      },
      (fd) =>
        subject.paymentId ? editPayment(undefined, fd) : editExpense(undefined, fd)
    );
  }

  const canEdit = Boolean(subject.paymentId || subject.expenseId);
  const isExpense = Boolean(subject.expenseId);
  /* Same-currency accounts only — a shilling cost cannot leave a dollar
     account, and editExpense refuses it anyway. */
  const eligibleAccounts = accounts.filter((a) => a.currency === subject.currency);

  if (subject.reversed) {
    /* A cost that has already been reversed has nothing left to offer: the
       opposite entry is itself a line on the register, and reversing a
       reversal is the edit this whole file exists to refuse. Its cancelled
       state already reads on the Costs list and on the entry's own page. */
    if (!subject.paymentId) return null;

    /* A cancelled payment shows only a way back in — the same "cancel was
       itself a mistake" door the payment's own page has always had, now
       reachable from wherever the line is read rather than only there. */
    return (
      <span className="relative z-10 inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(open === "restore" ? null : "restore")}
          className={iconButton}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("Reinstate")}
        </button>

        {open === "restore"
          ? createPortal(
              /*
                Portalled to the document body, not left where the trigger
                button sits.

                A pencil icon three levels deep in a horizontally-scrolling
                table row is inside an `overflow-x-auto` ancestor, and that
                ancestor clips everything painted inside it — including a
                `position: fixed` dialog, which browsers still confine to the
                nearest clipping box rather than letting it escape to the
                viewport the way "fixed" implies. Left where it was, the
                backdrop went dark only over the table's own rectangle, and
                the rest of the page — the totals above it, the sidebar,
                everything outside that box — stayed lit and readable right
                through the dialog sitting on top of it.
              */
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display font-semibold">
                  {t("Reinstate this payment")}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("Close")}
                  className="focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("Cancelled")}
                {subject.voidedByName ? ` ${t("by")} ${subject.voidedByName}` : ""}
                {subject.voidReason ? ` — "${subject.voidReason}"` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  "The money goes back into the account as a fresh line, dated today. The pickup note is not reinstated with it — issuing one is Finance saying the cargo may go, and that decision is made again on purpose, not restored as a side effect."
                )}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="fix-restore-reason">
                  {t("Why is it being reinstated?")}
                </Label>
                <Textarea
                  id="fix-restore-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("Cancelled by mistake")}
                />
              </div>
              {error ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || reason.trim().length < 3}
                  onClick={restoreIt}
                >
                  {pending ? t("Working…") : t("Reinstate it")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={close}>
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

  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      {canEdit ? (
        <button
          type="button"
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          className={iconButton}
        >
          <Pencil className="h-3.5 w-3.5" />
          {t("Edit")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(open === "cancel" ? null : "cancel")}
        className={`${iconButton} hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive`}
      >
        <Ban className="h-3.5 w-3.5" />
        {t("Cancel")}
      </button>

      {open
        ? createPortal(
            /* Same reasoning as the reinstate dialog above: portalled so an
               overflow-clipping ancestor — the ledger's horizontally-
               scrolling table, in particular — can never confine what is
               supposed to cover the whole screen. */
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display font-semibold">
                {open === "cancel"
                  ? t("Cancel this movement")
                  : t("Correct this record")}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("Close")}
                className="focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {open === "cancel" ? (
              <p className="text-sm text-muted-foreground">
                {subject.paymentId
                  ? t(
                      "The money comes off the bill, the cargo goes back to unpaid and any pickup note is withdrawn. A reversing line is posted against this one — the ledger is never edited, so the history still explains the balance."
                    )
                  : isExpense && subject.expenseStatus === "PAID"
                    ? t(
                        "The money has already left the account, so this posts the opposite entry rather than un-writing the line. The account balance ends up right, and the register still shows both the mistake and the correction."
                      )
                    : t(
                        "A reversing line is posted against this one. The ledger is never edited, so the history still explains the balance."
                      )}
              </p>
            ) : subject.paymentId ? (
              <>
                {subject.amountEditable ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="fix-amount">
                          {t("Amount")} ({subject.currency === "TZS" ? "TSh" : subject.currency})
                        </Label>
                        <Input
                          id="fix-amount"
                          value={amount}
                          inputMode="decimal"
                          onChange={(event) => setAmount(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fix-payment-account">{t("Landed in")}</Label>
                        <NativeSelect
                          id="fix-payment-account"
                          value={paymentAccountId}
                          onChange={(event) => setPaymentAccountId(event.target.value)}
                        >
                          <option value="">{t("Not recorded")}</option>
                          {eligibleAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>
                    {amountChanged || paymentAccountChanged ? (
                      <p className="text-xs text-warning">
                        {t(
                          "Changing the figure or the account cancels this payment and records it again: a fresh receipt number, the bill and the pickup note redone from it. The old line stays on the ledger with its reversal beside it."
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("What it says now. Type or pick over it to correct it.")}
                      </p>
                    )}
                  </>
                ) : null}
                {/*
                  No Reference, and no Note on a payment.

                  The owner's rule: on a payment the attachment is the record.
                  A typed M-Pesa code duplicates the screenshot that already
                  shows it, and a note beside it is a third place for a fact
                  nobody goes looking for.

                  A COST keeps its note — "what it was for" is the description,
                  and the note is where the rest of the story goes, with no
                  screenshot standing in for it.

                  Both columns stay and older values still display. Whatever
                  a record already carries is posted back unchanged, so
                  removing the field does not erase what somebody typed.
                */}
                {isExpense ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="fix-note">{t("Note")}</Label>
                    <Input
                      id="fix-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                ) : null}
                {subject.amountEditable ? null : (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "This payment settles more than one bill, so its figure is changed by cancelling it and recording it again against the bills it should cover."
                    )}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label>{t("Proof of payment")}</Label>
                  <AttachmentManager
                    kind="payment"
                    parentId={subject.paymentId}
                    attachments={subject.attachments}
                    editable
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fix-category">{t("Category")}</Label>
                    <NativeSelect
                      id="fix-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {EXPENSE_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {t(EXPENSE_CATEGORY_LABELS[value] ?? value)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fix-cost-amount">
                      {t("Amount")} ({subject.currency === "TZS" ? "TSh" : subject.currency})
                    </Label>
                    <Input
                      id="fix-cost-amount"
                      value={amount}
                      inputMode="decimal"
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fix-description">{t("What it was for")}</Label>
                  <Input
                    id="fix-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fix-vendor">{t("Paid to")}</Label>
                    <Input
                      id="fix-vendor"
                      value={vendor}
                      onChange={(event) => setVendor(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fix-incurred">{t("Date incurred")}</Label>
                    <Input
                      id="fix-incurred"
                      type="date"
                      value={incurredAt}
                      onChange={(event) => setIncurredAt(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fix-cost-account">{t("Paid from")}</Label>
                  <NativeSelect
                    id="fix-cost-account"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">{t("Not paid yet")}</option>
                    {eligibleAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {subject.expenseStatus === "PAID" ? (
                    <p className="text-xs text-warning">
                      {t(
                        "Moving the account or the figure on a cost that has already been paid reverses the old line and posts a corrected one — both stay on the register."
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fix-cost-note">{t("Note")}</Label>
                  <Input
                    id="fix-cost-note"
                    value={costNote}
                    onChange={(event) => setCostNote(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Receipt")}</Label>
                  <AttachmentManager
                    kind="expense"
                    parentId={subject.expenseId!}
                    attachments={subject.attachments}
                    editable
                  />
                </div>
              </>
            )}

            {open === "edit" ? (
              <div className="space-y-1.5">
                <Label htmlFor="fix-reason">
                  {t("What was wrong with the record?")}
                </Label>
                <Textarea
                  id="fix-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("Reference typed wrong")}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="fix-reason">
                  {t("Why is it being cancelled?")}
                </Label>
                <Textarea
                  id="fix-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("Test entry, money never received")}
                />
              </div>
            )}

            {error ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={open === "cancel" ? "destructive" : "default"}
                disabled={pending || reason.trim().length < 3}
                onClick={open === "cancel" ? cancelIt : saveEdit}
              >
                {pending
                  ? t("Working…")
                  : open === "cancel"
                    ? t("Cancel it")
                    : t("Save the correction")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
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
