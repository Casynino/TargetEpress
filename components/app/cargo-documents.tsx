"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Paperclip,
  Upload,
  X,
} from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useLocale, useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  attachCargoDocuments,
  removeCargoDocument,
} from "@/lib/actions/cargo-documents";
import {
  ATTACHMENT_BUDGET_BYTES,
  SHIPMENT_DOCUMENT_KINDS,
  SHIPMENT_DOCUMENT_KIND_LABELS,
  megabytes,
  type ShipmentDocumentKindValue,
} from "@/lib/cargo-documents";
import { formatDate } from "@/lib/format";

/**
 * The consignment's paperwork, on the cargo record.
 *
 * Two halves, in this order on purpose: what is already filed, then the form to
 * file more. The list first is what makes the panel worth opening for the nine
 * readers out of ten who are looking for the customs entry rather than adding
 * one — and reading "nothing is filed against this cargo" is itself the prompt.
 *
 * Nothing here can block anything. Attaching is its own act, separate from
 * saving the cargo, so a clerk who has not been sent the invoice yet simply
 * leaves the panel alone and every other screen behaves exactly as before. That
 * is the owner's rule for every upload in this system: plainly expected, never
 * compulsory.
 */

export type CargoDocumentRow = {
  id: string;
  kind: ShipmentDocumentKindValue;
  label: string | null;
  url: string;
  filename: string | null;
  contentType: string;
  bytes: number;
  createdAt: Date | string;
  uploadedByName: string | null;
  /** True when the reader is the person who attached it — they may take it back. */
  mine: boolean;
};

export function CargoDocuments({
  shipmentId,
  documents,
  canAttach,
  canRemoveAny,
  showNames,
  durable,
}: {
  shipmentId: string;
  documents: CargoDocumentRow[];
  canAttach: boolean;
  /** Management, who may take off a file somebody else attached. */
  canRemoveAny: boolean;
  /** Staff names are internal; the warehouse sees the file, not the colleague. */
  showNames: boolean;
  /** False when storage is local disk — say so rather than imply permanence. */
  durable: boolean;
}) {
  const t = useT();

  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <Paperclip className="h-4 w-4" />
          {t("Paperwork")}
        </h2>
        <p className="text-xs text-muted-foreground tabular">
          {documents.length}
        </p>
      </div>

      {documents.length > 0 ? (
        <ul className="divide-y">
          {documents.map((row) => (
            <DocumentRow
              key={row.id}
              row={row}
              canRemove={canAttach && (row.mine || canRemoveAny)}
              showNames={showNames}
            />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {/* Stated, not warned about. A consignment with no paperwork is
              normal — most of it arrives days after the cargo does — so this
              says what belongs here and leaves it at that. The panel above it
              already reads "0". */}
          {t(
            "Nothing filed yet. The supplier's invoice, the packing list and the customs paperwork belong here, so the next person does not have to ask in a group chat for them."
          )}
        </p>
      )}

      {canAttach ? (
        <AttachForm shipmentId={shipmentId} durable={durable} />
      ) : null}
    </section>
  );
}

/**
 * The size, in the unit the number is actually readable in.
 *
 * KB below a megabyte: "0.2 MB" beside a one-page scan tells a clerk nothing,
 * and the reason the size is here at all is so somebody can tell the one-page
 * receipt from the eleven-page customs bundle without opening both.
 */
function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : megabytes(bytes);
}

/** PDFs and photographs of paper look different in a list, so they read differently. */
function KindIcon({ contentType }: { contentType: string }) {
  return contentType.startsWith("image/") ? (
    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
  ) : (
    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
  );
}

function DocumentRow({
  row,
  canRemove,
  showNames,
}: {
  row: CargoDocumentRow;
  canRemove: boolean;
  showNames: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [state, action] = useActionState(removeCargoDocument, undefined);
  const [open, setOpen] = useState(false);

  const name =
    row.label ?? row.filename ?? t(SHIPMENT_DOCUMENT_KIND_LABELS[row.kind]);

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <KindIcon contentType={row.contentType} />
          <div className="min-w-0">
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring block truncate rounded text-sm font-medium hover:text-brand hover:underline"
            >
              {name}
            </a>
            {/* What it is, who filed it, when. The three questions asked of a
                document six weeks later, in one line. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(SHIPMENT_DOCUMENT_KIND_LABELS[row.kind])} ·{" "}
              {formatDate(row.createdAt, locale)}
              {showNames && row.uploadedByName
                ? ` · ${row.uploadedByName}`
                : ""}
            </p>
            {/* The filename as well as the note, when both exist — a clerk
                recognises their own upload by the name it had on their phone —
                and the size, so the one-page receipt is tellable from the
                eleven-page customs bundle without opening both. */}
            <p className="truncate text-xs text-muted-foreground/80 tabular">
              {row.label && row.filename ? `${row.filename} · ` : ""}
              {sizeLabel(row.bytes)}
            </p>
          </div>
        </div>

        {canRemove ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="focus-ring shrink-0 rounded text-xs font-medium text-muted-foreground hover:text-destructive"
          >
            {open ? t("Keep it") : t("Remove")}
          </button>
        ) : null}
      </div>

      {open && canRemove ? (
        <form action={action} className="mt-3 space-y-2 border-t pt-3">
          <input type="hidden" name="documentId" value={row.id} />
          <FormError state={state} />
          <Label htmlFor={`reason-${row.id}`} className="text-xs">
            {t("Why is it coming off?")}
          </Label>
          <Input
            id={`reason-${row.id}`}
            name="reason"
            required
            className="h-9 text-sm"
            placeholder={t("e.g. Wrong month's invoice — the right one is attached")}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Kept permanently in the audit log, with the file name, so a removal can always be answered for."
            )}
          </p>
          <SubmitButton size="sm" variant="destructive" pendingLabel="Removing…">
            <X className="mr-1.5 h-3.5 w-3.5" />
            {t("Remove")}
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}

function AttachForm({
  shipmentId,
  durable,
}: {
  shipmentId: string;
  durable: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState(attachCargoDocuments, undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ name: string; bytes: number }[]>([]);

  const total = chosen.reduce((sum, file) => sum + file.bytes, 0);
  const overBudget = total > ATTACHMENT_BUDGET_BYTES;

  // Cleared once the server has them, so the form does not sit there looking as
  // though the same two PDFs are still waiting to be sent.
  useEffect(() => {
    if (state?.ok) {
      setChosen([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state]);

  return (
    <form action={action} className="space-y-3 border-t bg-muted/20 p-5">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <FormError state={state} />
      {state?.ok && state.data ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          {state.data.attached} {t("file(s) attached to this cargo.")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`kind-${shipmentId}`} className="text-xs">
            {t("What is it?")}
          </Label>
          <NativeSelect
            id={`kind-${shipmentId}`}
            name="kind"
            defaultValue="SUPPLIER_INVOICE"
            className="h-9 text-sm"
          >
            {SHIPMENT_DOCUMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(SHIPMENT_DOCUMENT_KIND_LABELS[kind])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`label-${shipmentId}`} className="text-xs">
            {t("Note on it")}{" "}
            <span className="text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input
            id={`label-${shipmentId}`}
            name="label"
            className="h-9 text-sm"
            placeholder={t("e.g. Duty receipt, entry TZ-4471")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={`documents-${shipmentId}`}
          className="flex items-center gap-1.5 text-xs"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {t("The file")}
        </Label>
        <Input
          ref={fileRef}
          id={`documents-${shipmentId}`}
          name="documents"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          onChange={(event) =>
            setChosen(
              Array.from(event.target.files ?? []).map((file) => ({
                name: file.name,
                bytes: file.size,
              }))
            )
          }
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "PDF or a photograph of the paper. Attach it if you have it — nothing here is required, and no other screen waits on it."
          )}
        </p>
      </div>

      {/*
        Caught in the browser, because the server never gets the chance.

        A Vercel function refuses a request body over 4.5 MB and no setting
        raises it, so two 3 MB scans chosen together died as "something went
        wrong" with nothing saved and no error of ours anywhere. Adding the
        chosen files up here is the only place this can be said in time.
      */}
      {chosen.length > 0 ? (
        <p
          className={`text-xs ${overBudget ? "text-destructive" : "text-muted-foreground"} tabular`}
        >
          {chosen.length} {t("chosen")} · {megabytes(total)}
          {overBudget
            ? ` — ${t("too much to send at once. Attach them one at a time; the limit is")} ${megabytes(ATTACHMENT_BUDGET_BYTES)}.`
            : ""}
        </p>
      ) : null}

      {/* Addressed to the person choosing the file, not to whoever configures
          the deployment. Its own sentence rather than the photo one: "photos"
          is wrong for a customs entry, and a warning that describes the wrong
          thing gets read as not applying. */}
      {!durable ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
          {t(
            "Files are being saved to this machine only and may be lost. Tell the office before relying on them as the record."
          )}
        </p>
      ) : null}

      <SubmitButton
        size="sm"
        variant="secondary"
        disabled={overBudget}
        pendingLabel="Attaching…"
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        {t("Attach")}
      </SubmitButton>
    </form>
  );
}
