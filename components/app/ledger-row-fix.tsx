"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pencil, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelLedgerEntry } from "@/lib/actions/ledger";
import { voidPayment, editPayment } from "@/lib/actions/payment-corrections";
import { voidExpense, editExpense } from "@/lib/actions/expenses";

export type LedgerRowSubject = {
  entryId: string;
  /** The customer payment behind this line, when there is one. */
  paymentId: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  /** The recorded cost behind this line, when there is one. */
  expenseId: string | null;
  expenseDescription: string | null;
  /** Already answered by a reversing line — nothing left to do here. */
  reversed: boolean;
};

/**
 * FIX THE LINE FROM THE LINE.
 *
 * Both of these existed and neither was reachable: the pencil opened the
 * invoice and the cancel opened the entry's own page, so correcting a fifty-
 * four shilling test meant leaving the register, finding the bill, and finding
 * the way back. A desk reading down a ledger is looking at the line it wants to
 * fix; the fix belongs there.
 *
 * CANCELLING IS A REVERSAL, NOT A DELETION. The ledger is append-only, and that
 * is why no figure in this system has ever drifted: a wrong line is answered by
 * a line pointing back at it, so the history still reads true and the balance
 * still explains itself. What the desk means by "delete" happens in full —
 * the payment is voided, the money comes off the bill, the cargo goes back to
 * unpaid and its pickup note is withdrawn — it is simply recorded rather than
 * hidden. One reason, typed once, and the whole chain follows.
 */
export function LedgerRowFix({ subject }: { subject: LedgerRowSubject }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<"cancel" | "edit" | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState(subject.paymentReference ?? "");
  const [note, setNote] = useState(subject.paymentNote ?? "");
  const [description, setDescription] = useState(
    subject.expenseDescription ?? ""
  );
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
            ? voidExpense(undefined, fd)
            : cancelLedgerEntry(undefined, fd)
    );
  }

  function saveEdit() {
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
          fd.set("description", description);
        }
        return fd;
      },
      (fd) =>
        subject.paymentId ? editPayment(undefined, fd) : editExpense(undefined, fd)
    );
  }

  if (subject.reversed) return null;

  const canEdit = Boolean(subject.paymentId || subject.expenseId);

  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      {canEdit ? (
        <button
          type="button"
          title={t("Correct this record")}
          aria-label={t("Correct this record")}
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          className="focus-ring rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        title={t("Cancel this movement")}
        aria-label={t("Cancel this movement")}
        onClick={() => setOpen(open === "cancel" ? null : "cancel")}
        className="focus-ring rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Ban className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-xl border bg-card p-5 text-left shadow-lg">
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
                  : t(
                      "A reversing line is posted against this one. The ledger is never edited, so the history still explains the balance."
                    )}
              </p>
            ) : subject.paymentId ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fix-reference">{t("Reference")}</Label>
                  <Input
                    id="fix-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={t("M-Pesa code, slip number")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fix-note">{t("Note")}</Label>
                  <Input
                    id="fix-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                {/* Said plainly rather than discovered: the figure is the one
                    thing an edit cannot move, because the ledger, the bill and
                    the pickup note were all written from it. */}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "To change the amount, cancel this and record it again — the ledger line, the bill and the pickup note were all written from the figure, and they have to be rewritten together."
                  )}
                </p>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="fix-description">{t("What it was for")}</Label>
                <Input
                  id="fix-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fix-reason">
                {open === "cancel"
                  ? t("Why is it being cancelled?")
                  : t("What was wrong with the record?")}
              </Label>
              <Textarea
                id="fix-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  open === "cancel"
                    ? t("Test entry, money never received")
                    : t("Reference typed wrong")
                }
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
        </div>
      ) : null}
    </span>
  );
}
