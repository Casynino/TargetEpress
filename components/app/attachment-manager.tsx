"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import {
  addExpenseReceipt,
  removeExpenseReceipt,
} from "@/lib/actions/expenses";
import {
  addPaymentProof,
  removePaymentProof,
} from "@/lib/actions/payment-corrections";
import {
  addSubmissionProof,
  removeSubmissionProof,
} from "@/lib/actions/submission-corrections";

export type Attachment = {
  id: string;
  url: string;
  filename: string | null;
  contentType: string;
  bytes: number;
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The evidence behind a payment or a cost — shown, added to, or taken back off.
 *
 * One component for both sides of the ledger because the shape of the problem
 * is identical: a typed figure is a claim, and the screenshot or till slip is
 * what settles an argument about it later. What used to be true only at the
 * moment of recording — attach it here, once, or not at all — is now true for
 * the life of the record: the wrong screenshot can be swapped for the right
 * one, and a receipt that arrived by WhatsApp an hour later can still be
 * added.
 *
 * Removing is not a money action. It changes what backs the figure up, not
 * the figure, the ledger, or the bill — so it asks for nothing but a click.
 */
export function AttachmentManager({
  kind,
  parentId,
  attachments,
  editable,
}: {
  /* A submission is the third object with evidence behind it, and it needs
     its own pair of actions rather than the payment's: a pending claim has no
     Payment yet, and this desk does not hold ledger.adjust. */
  kind: "payment" | "expense" | "submission";
  parentId: string;
  attachments: Attachment[];
  editable: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const idField =
    kind === "payment"
      ? "paymentId"
      : kind === "submission"
        ? "submissionId"
        : "expenseId";

  function addFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set(idField, parentId);
      fd.set("file", file);
      const result = await (kind === "payment"
        ? addPaymentProof(undefined, fd)
        : kind === "submission"
          ? addSubmissionProof(undefined, fd)
          : addExpenseReceipt(undefined, fd));
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set(kind === "expense" ? "receiptId" : "proofId", id);
      const result = await (kind === "payment"
        ? removePaymentProof(undefined, fd)
        : kind === "submission"
          ? removeSubmissionProof(undefined, fd)
          : removeExpenseReceipt(undefined, fd));
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Nothing attached.")}
        </p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1 text-xs"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-brand hover:underline"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {a.filename ?? t("Attachment")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  · {fileSize(a.bytes)}
                </span>
              </a>
              {editable ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(a.id)}
                  aria-label={t("Remove this attachment")}
                  title={t("Remove this attachment")}
                  className="focus-ring shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="block flex-1 text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-[11px]"
            disabled={pending}
            onClick={addFile}
          >
            {pending ? t("Adding…") : t("Add")}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
